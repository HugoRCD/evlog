import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WideEvent } from '../../src/types'
import { sendBatchToAxiom, sendToAxiom } from '../../src/adapters/axiom'

describe('axiom adapter', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const createTestEvent = (overrides?: Partial<WideEvent>): WideEvent => ({
    timestamp: '2024-01-01T12:00:00.000Z',
    level: 'info',
    service: 'test-service',
    environment: 'test',
    ...overrides,
  })

  describe('sendToAxiom', () => {
    it('sends event to correct Axiom URL', async () => {
      const event = createTestEvent()

      await sendToAxiom(event, {
        dataset: 'my-dataset',
        token: 'test-token',
      })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://api.axiom.co/v1/datasets/my-dataset/ingest')
    })

    it('uses custom base URL when provided', async () => {
      const event = createTestEvent()

      await sendToAxiom(event, {
        dataset: 'my-dataset',
        token: 'test-token',
        baseUrl: 'https://custom.axiom.co',
      })

      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://custom.axiom.co/v1/datasets/my-dataset/ingest')
    })

    it('URL encodes dataset name', async () => {
      const event = createTestEvent()

      await sendToAxiom(event, {
        dataset: 'my dataset/test',
        token: 'test-token',
      })

      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://api.axiom.co/v1/datasets/my%20dataset%2Ftest/ingest')
    })

    it('sets correct Authorization header', async () => {
      const event = createTestEvent()

      await sendToAxiom(event, {
        dataset: 'my-dataset',
        token: 'my-secret-token',
      })

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(options.headers).toEqual(expect.objectContaining({
        'Authorization': 'Bearer my-secret-token',
      }))
    })

    it('includes X-Axiom-Org-Id header when orgId is provided', async () => {
      const event = createTestEvent()

      await sendToAxiom(event, {
        dataset: 'my-dataset',
        token: 'test-token',
        orgId: 'my-org-123',
      })

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(options.headers).toEqual(expect.objectContaining({
        'X-Axiom-Org-Id': 'my-org-123',
      }))
    })

    it('does not include X-Axiom-Org-Id header when orgId is not provided', async () => {
      const event = createTestEvent()

      await sendToAxiom(event, {
        dataset: 'my-dataset',
        token: 'test-token',
      })

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const headers = options.headers as Record<string, string>
      expect(headers['X-Axiom-Org-Id']).toBeUndefined()
    })

    it('sets Content-Type to application/json', async () => {
      const event = createTestEvent()

      await sendToAxiom(event, {
        dataset: 'my-dataset',
        token: 'test-token',
      })

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(options.headers).toEqual(expect.objectContaining({
        'Content-Type': 'application/json',
      }))
    })

    it('sends event as JSON array in body', async () => {
      const event = createTestEvent({ action: 'test-action', userId: '123' })

      await sendToAxiom(event, {
        dataset: 'my-dataset',
        token: 'test-token',
      })

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(options.body as string)
      expect(body).toEqual([event])
    })

    it('throws error on non-OK response', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response('Bad Request', { status: 400, statusText: 'Bad Request' }),
      )

      const event = createTestEvent()

      await expect(sendToAxiom(event, {
        dataset: 'my-dataset',
        token: 'test-token',
      })).rejects.toThrow('Axiom API error: 400 Bad Request')
    })
  })

  describe('sendBatchToAxiom', () => {
    it('sends multiple events in a single request', async () => {
      const events = [
        createTestEvent({ requestId: '1' }),
        createTestEvent({ requestId: '2' }),
        createTestEvent({ requestId: '3' }),
      ]

      await sendBatchToAxiom(events, {
        dataset: 'my-dataset',
        token: 'test-token',
      })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(options.body as string)
      expect(body).toHaveLength(3)
      expect(body).toEqual(events)
    })

    it('sends empty array when no events', async () => {
      await sendBatchToAxiom([], {
        dataset: 'my-dataset',
        token: 'test-token',
      })

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(options.body as string)
      expect(body).toEqual([])
    })
  })

  describe('timeout handling', () => {
    it('uses default timeout of 5000ms', async () => {
      const event = createTestEvent()
      const controller = new AbortController()

      // Mock setTimeout to capture the timeout value
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

      await sendToAxiom(event, {
        dataset: 'my-dataset',
        token: 'test-token',
      })

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5000)
    })

    it('uses custom timeout when provided', async () => {
      const event = createTestEvent()
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

      await sendToAxiom(event, {
        dataset: 'my-dataset',
        token: 'test-token',
        timeout: 10000,
      })

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 10000)
    })
  })
})
