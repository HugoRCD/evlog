// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DrainContext } from '../src/types'
import { createBrowserDrain, createBrowserLogDrain } from '../src/browser'

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

describe('createBrowserDrain', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('sends batch as JSON to the configured endpoint', async () => {
    const drain = createBrowserDrain({ endpoint: '/api/logs' })
    const batch = [createTestContext(1), createTestContext(2)]

    await drain(batch)

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, options] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('/api/logs')
    expect(options?.method).toBe('POST')
    expect(options?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(options?.body).toBe(JSON.stringify(batch))
    expect(options?.keepalive).toBe(true)
    expect(options?.credentials).toBe('same-origin')
  })

  it('sends custom headers with fetch', async () => {
    const drain = createBrowserDrain({
      endpoint: '/api/logs',
      headers: { 'Authorization': 'Bearer tok_123', 'X-API-Key': 'key_456' },
    })

    await drain([createTestContext(1)])

    const [, options] = vi.mocked(fetch).mock.calls[0]!
    expect(options?.headers).toEqual({
      'Content-Type': 'application/json',
      'Authorization': 'Bearer tok_123',
      'X-API-Key': 'key_456',
    })
  })

  it('skips empty batches', async () => {
    const drain = createBrowserDrain({ endpoint: '/api/logs' })

    await drain([])

    expect(fetch).not.toHaveBeenCalled()
  })

  it('throws on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }))

    const drain = createBrowserDrain({ endpoint: '/api/logs' })

    await expect(drain([createTestContext(1)])).rejects.toThrow('[evlog/browser] Server responded with 500')
  })

  it('aborts after timeout', async () => {
    vi.useRealTimers()
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => {
      return new Promise((_resolve, reject) => {
        const signal = options?.signal as AbortSignal | undefined
        if (signal?.aborted) {
          reject(new DOMException('The operation was aborted.', 'AbortError'))
          return
        }
        signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        })
      })
    })

    const drain = createBrowserDrain({ endpoint: '/api/logs', timeout: 10 })

    await expect(drain([createTestContext(1)])).rejects.toThrow(/abort/i)
  })

  describe('sendBeacon', () => {
    let originalVisibilityState: PropertyDescriptor | undefined

    beforeEach(() => {
      originalVisibilityState = Object.getOwnPropertyDescriptor(document, 'visibilityState')
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        writable: true,
        configurable: true,
      })
      Object.defineProperty(navigator, 'sendBeacon', {
        value: vi.fn().mockReturnValue(true),
        writable: true,
        configurable: true,
      })
    })

    afterEach(() => {
      if (originalVisibilityState) {
        Object.defineProperty(document, 'visibilityState', originalVisibilityState)
      } else {
        delete (document as Record<string, unknown>).visibilityState
      }
    })

    it('uses sendBeacon when page is hidden', async () => {
      const drain = createBrowserDrain({ endpoint: '/api/logs' })
      const batch = [createTestContext(1)]

      await drain(batch)

      expect(navigator.sendBeacon).toHaveBeenCalledTimes(1)
      const [url, blob] = vi.mocked(navigator.sendBeacon).mock.calls[0]!
      expect(url).toBe('/api/logs')
      expect(blob).toBeInstanceOf(Blob)
      expect((blob as Blob).type).toBe('application/json')
      expect(fetch).not.toHaveBeenCalled()
    })

    it('throws if sendBeacon returns false', async () => {
      vi.mocked(navigator.sendBeacon).mockReturnValue(false)

      const drain = createBrowserDrain({ endpoint: '/api/logs' })

      await expect(drain([createTestContext(1)])).rejects.toThrow('sendBeacon failed')
    })

    it('falls back to fetch when useBeacon is false', async () => {
      const drain = createBrowserDrain({ endpoint: '/api/logs', useBeacon: false })

      await drain([createTestContext(1)])

      expect(fetch).toHaveBeenCalledTimes(1)
      expect(navigator.sendBeacon).not.toHaveBeenCalled()
    })

    it('falls back to fetch when sendBeacon is unavailable', async () => {
      Object.defineProperty(navigator, 'sendBeacon', {
        value: undefined,
        writable: true,
        configurable: true,
      })

      const drain = createBrowserDrain({ endpoint: '/api/logs' })

      await drain([createTestContext(1)])

      expect(fetch).toHaveBeenCalledTimes(1)
    })
  })
})

describe('createBrowserLogDrain', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns a PipelineDrainFn with flush and pending', () => {
    const drain = createBrowserLogDrain({
      drain: { endpoint: '/api/logs' },
      autoFlush: false,
    })

    expect(typeof drain).toBe('function')
    expect(typeof drain.flush).toBe('function')
    expect(drain.pending).toBe(0)
  })

  it('batches and sends events through the pipeline', async () => {
    const drain = createBrowserLogDrain({
      drain: { endpoint: '/api/logs' },
      pipeline: { batch: { size: 2, intervalMs: 60000 } },
      autoFlush: false,
    })

    drain(createTestContext(1))
    drain(createTestContext(2))

    await vi.runAllTimersAsync()

    expect(fetch).toHaveBeenCalledTimes(1)
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]?.body as string)
    expect(body).toHaveLength(2)
  })

  it('flush drains all pending events', async () => {
    const drain = createBrowserLogDrain({
      drain: { endpoint: '/api/logs' },
      pipeline: { batch: { size: 100 } },
      autoFlush: false,
    })

    drain(createTestContext(1))
    drain(createTestContext(2))
    expect(drain.pending).toBe(2)

    await drain.flush()

    expect(drain.pending).toBe(0)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('registers visibilitychange listener by default', () => {
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener')

    createBrowserLogDrain({
      drain: { endpoint: '/api/logs' },
    })

    expect(addEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))

    addEventListenerSpy.mockRestore()
  })

  it('does not register visibilitychange listener when autoFlush is false', () => {
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener')

    createBrowserLogDrain({
      drain: { endpoint: '/api/logs' },
      autoFlush: false,
    })

    expect(addEventListenerSpy).not.toHaveBeenCalledWith('visibilitychange', expect.any(Function))

    addEventListenerSpy.mockRestore()
  })

  it('uses custom pipeline options', async () => {
    const drain = createBrowserLogDrain({
      drain: { endpoint: '/api/logs' },
      pipeline: { batch: { size: 1, intervalMs: 100 } },
      autoFlush: false,
    })

    drain(createTestContext(1))

    await vi.runAllTimersAsync()

    expect(fetch).toHaveBeenCalledTimes(1)
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]?.body as string)
    expect(body).toHaveLength(1)
  })
})
