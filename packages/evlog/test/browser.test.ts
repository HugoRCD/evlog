import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DrainContext } from '../src/types'
import { createBrowserDrain } from '../src/browser'

function createTestContext(id: number): DrainContext {
  return {
    event: {
      timestamp: '2024-01-01T00:00:00.000Z',
      level: 'info',
      service: 'test',
      environment: 'test',
      id,
    },
  }
}

function mockFetch(ok = true, status = 204) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? 'No Content' : 'Bad Request',
  })
}

describe('createBrowserDrain', () => {
  let originalFetch: typeof globalThis.fetch
  let originalDocument: typeof globalThis.document
  let originalNavigator: typeof globalThis.navigator

  beforeEach(() => {
    vi.useFakeTimers()
    originalFetch = globalThis.fetch
    originalDocument = globalThis.document
    originalNavigator = globalThis.navigator

    // Default: page is visible, sendBeacon available
    Object.defineProperty(globalThis, 'document', {
      value: {
        visibilityState: 'visible',
        addEventListener: vi.fn(),
      },
      writable: true,
      configurable: true,
    })

    Object.defineProperty(globalThis, 'navigator', {
      value: { sendBeacon: vi.fn().mockReturnValue(true) },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    globalThis.fetch = originalFetch
    Object.defineProperty(globalThis, 'document', { value: originalDocument, writable: true, configurable: true })
    Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, writable: true, configurable: true })
  })

  describe('fetch transport', () => {
    it('sends batched events via fetch with keepalive', async () => {
      const fetchMock = mockFetch()
      globalThis.fetch = fetchMock

      const drain = createBrowserDrain({
        endpoint: '/api/logs',
        batch: { size: 2, intervalMs: 60000 },
      })

      drain(createTestContext(1))
      drain(createTestContext(2))

      await vi.runAllTimersAsync()

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, options] = fetchMock.mock.calls[0]!
      expect(url).toBe('/api/logs')
      expect(options.method).toBe('POST')
      expect(options.keepalive).toBe(true)
      expect(options.headers['Content-Type']).toBe('application/json')

      const body = JSON.parse(options.body)
      expect(body).toHaveLength(2)
      expect(body[0].id).toBe(1)
      expect(body[1].id).toBe(2)
    })

    it('includes custom headers in fetch requests', async () => {
      const fetchMock = mockFetch()
      globalThis.fetch = fetchMock

      const drain = createBrowserDrain({
        endpoint: '/api/logs',
        batch: { size: 1 },
        headers: { 'X-Custom': 'value', 'Authorization': 'Bearer token' },
      })

      drain(createTestContext(1))
      await vi.runAllTimersAsync()

      const options = fetchMock.mock.calls[0]![1]
      expect(options.headers['X-Custom']).toBe('value')
      expect(options.headers['Authorization']).toBe('Bearer token')
      expect(options.headers['Content-Type']).toBe('application/json')
    })

    it('sends only event data (not full DrainContext)', async () => {
      const fetchMock = mockFetch()
      globalThis.fetch = fetchMock

      const drain = createBrowserDrain({
        endpoint: '/api/logs',
        batch: { size: 1 },
      })

      drain({
        event: { timestamp: 'now', level: 'info', service: 'test', environment: 'test', action: 'click' },
        request: { method: 'GET', path: '/page' },
        headers: { 'x-request-id': '123' },
      })

      await vi.runAllTimersAsync()

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body)
      expect(body).toHaveLength(1)
      // Should contain event fields, not request/headers from DrainContext
      expect(body[0].action).toBe('click')
      expect(body[0].request).toBeUndefined()
    })

    it('throws on non-ok response so pipeline retries', async () => {
      const fetchMock = mockFetch(false, 500)
      globalThis.fetch = fetchMock
      const onDropped = vi.fn()

      const drain = createBrowserDrain({
        endpoint: '/api/logs',
        batch: { size: 1 },
        retry: { maxAttempts: 1 },
        onDropped,
      })

      drain(createTestContext(1))
      await vi.runAllTimersAsync()

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(onDropped).toHaveBeenCalledTimes(1)
      expect(onDropped.mock.calls[0]![1]).toBeInstanceOf(Error)
      expect((onDropped.mock.calls[0]![1] as Error).message).toContain('proxy error: 500')
    })
  })

  describe('sendBeacon transport', () => {
    it('uses sendBeacon when page is hidden', async () => {
      const fetchMock = mockFetch()
      globalThis.fetch = fetchMock

      Object.defineProperty(globalThis, 'document', {
        value: {
          visibilityState: 'hidden',
          addEventListener: vi.fn(),
        },
        writable: true,
        configurable: true,
      })

      const sendBeaconMock = vi.fn().mockReturnValue(true)
      Object.defineProperty(globalThis, 'navigator', {
        value: { sendBeacon: sendBeaconMock },
        writable: true,
        configurable: true,
      })

      const drain = createBrowserDrain({
        endpoint: '/api/logs',
        batch: { size: 1 },
      })

      drain(createTestContext(1))
      await vi.runAllTimersAsync()

      expect(sendBeaconMock).toHaveBeenCalledTimes(1)
      expect(sendBeaconMock).toHaveBeenCalledWith('/api/logs', expect.any(String))
      expect(fetchMock).not.toHaveBeenCalled()

      const body = JSON.parse(sendBeaconMock.mock.calls[0]![1])
      expect(body).toHaveLength(1)
      expect(body[0].id).toBe(1)
    })

    it('throws when sendBeacon returns false', async () => {
      Object.defineProperty(globalThis, 'document', {
        value: {
          visibilityState: 'hidden',
          addEventListener: vi.fn(),
        },
        writable: true,
        configurable: true,
      })

      const sendBeaconMock = vi.fn().mockReturnValue(false)
      Object.defineProperty(globalThis, 'navigator', {
        value: { sendBeacon: sendBeaconMock },
        writable: true,
        configurable: true,
      })

      const onDropped = vi.fn()
      const drain = createBrowserDrain({
        endpoint: '/api/logs',
        batch: { size: 1 },
        retry: { maxAttempts: 1 },
        onDropped,
      })

      drain(createTestContext(1))
      await vi.runAllTimersAsync()

      expect(onDropped).toHaveBeenCalledTimes(1)
      expect((onDropped.mock.calls[0]![1] as Error).message).toContain('sendBeacon failed')
    })

    it('falls back to fetch when sendBeacon is unavailable', async () => {
      const fetchMock = mockFetch()
      globalThis.fetch = fetchMock

      Object.defineProperty(globalThis, 'document', {
        value: {
          visibilityState: 'hidden',
          addEventListener: vi.fn(),
        },
        writable: true,
        configurable: true,
      })

      Object.defineProperty(globalThis, 'navigator', {
        value: {},
        writable: true,
        configurable: true,
      })

      const drain = createBrowserDrain({
        endpoint: '/api/logs',
        batch: { size: 1 },
      })

      drain(createTestContext(1))
      await vi.runAllTimersAsync()

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('batching', () => {
    it('respects batch size', async () => {
      const fetchMock = mockFetch()
      globalThis.fetch = fetchMock

      const drain = createBrowserDrain({
        endpoint: '/api/logs',
        batch: { size: 3, intervalMs: 60000 },
      })

      drain(createTestContext(1))
      drain(createTestContext(2))

      await vi.advanceTimersByTimeAsync(0)
      expect(fetchMock).not.toHaveBeenCalled()

      drain(createTestContext(3))
      await vi.runAllTimersAsync()

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const body = JSON.parse(fetchMock.mock.calls[0]![1].body)
      expect(body).toHaveLength(3)
    })

    it('flushes on interval even if batch is not full', async () => {
      const fetchMock = mockFetch()
      globalThis.fetch = fetchMock

      const drain = createBrowserDrain({
        endpoint: '/api/logs',
        batch: { size: 100, intervalMs: 2000 },
      })

      drain(createTestContext(1))

      await vi.advanceTimersByTimeAsync(1999)
      expect(fetchMock).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('retry', () => {
    it('retries on failure via pipeline', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Error' })
        .mockResolvedValueOnce({ ok: true, status: 204, statusText: 'No Content' })
      globalThis.fetch = fetchMock

      const drain = createBrowserDrain({
        endpoint: '/api/logs',
        batch: { size: 1 },
        retry: { maxAttempts: 2, backoff: 'fixed', initialDelayMs: 100 },
      })

      drain(createTestContext(1))

      // First attempt
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchMock).toHaveBeenCalledTimes(1)

      // Retry after 100ms
      await vi.advanceTimersByTimeAsync(100)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })

  describe('flush', () => {
    it('flushes all buffered events', async () => {
      const fetchMock = mockFetch()
      globalThis.fetch = fetchMock

      const drain = createBrowserDrain({
        endpoint: '/api/logs',
        batch: { size: 100, intervalMs: 60000 },
      })

      drain(createTestContext(1))
      drain(createTestContext(2))
      drain(createTestContext(3))

      expect(drain.pending).toBe(3)
      await drain.flush()

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(drain.pending).toBe(0)
    })
  })

  describe('visibilitychange listener', () => {
    it('registers a visibilitychange listener', () => {
      const addEventListenerMock = vi.fn()
      Object.defineProperty(globalThis, 'document', {
        value: {
          visibilityState: 'visible',
          addEventListener: addEventListenerMock,
        },
        writable: true,
        configurable: true,
      })

      createBrowserDrain({ endpoint: '/api/logs' })

      expect(addEventListenerMock).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    })
  })

  describe('defaults', () => {
    it('uses default batch size of 25 and interval of 2000ms', async () => {
      const fetchMock = mockFetch()
      globalThis.fetch = fetchMock

      const drain = createBrowserDrain({ endpoint: '/api/logs' })

      drain(createTestContext(1))

      // Default interval is 2000ms
      await vi.advanceTimersByTimeAsync(1999)
      expect(fetchMock).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('uses default retry maxAttempts of 2', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Error' })
      globalThis.fetch = fetchMock
      const onDropped = vi.fn()

      const drain = createBrowserDrain({
        endpoint: '/api/logs',
        batch: { size: 1 },
        onDropped,
      })

      drain(createTestContext(1))
      await vi.runAllTimersAsync()

      // Default maxAttempts is 2 (set by createBrowserDrain)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(onDropped).toHaveBeenCalledTimes(1)
    })
  })

  describe('empty batch', () => {
    it('does not send anything for an empty flush', async () => {
      const fetchMock = mockFetch()
      globalThis.fetch = fetchMock

      const drain = createBrowserDrain({ endpoint: '/api/logs' })
      await drain.flush()

      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})
