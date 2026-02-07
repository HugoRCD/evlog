import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WideEvent } from '../../src/types'
import { sendBatchToSentry, sendToSentry, toSentryEvent } from '../../src/adapters/sentry'

describe('sentry adapter', () => {
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

  describe('toSentryEvent', () => {
    it('maps warn level to warning', () => {
      const event = createTestEvent({ level: 'warn' })
      const result = toSentryEvent(event, { dsn: 'https://public@o0.ingest.sentry.io/123' })

      expect(result.level).toBe('warning')
    })

    it('prefers configured message', () => {
      const event = createTestEvent({ message: 'event message' })
      const result = toSentryEvent(event, {
        dsn: 'https://public@o0.ingest.sentry.io/123',
        message: 'override message',
      })

      expect(result.message).toBe('override message')
    })

    it('uses event message when available', () => {
      const event = createTestEvent({ message: 'event message' })
      const result = toSentryEvent(event, { dsn: 'https://public@o0.ingest.sentry.io/123' })

      expect(result.message).toBe('event message')
    })

    it('includes service tag and extra fields', () => {
      const event = createTestEvent({ requestId: 'req-1', action: 'checkout' })
      const result = toSentryEvent(event, { dsn: 'https://public@o0.ingest.sentry.io/123' })

      expect(result.tags?.service).toBe('test-service')
      expect(result.extra?.requestId).toBe('req-1')
      expect(result.extra?.action).toBe('checkout')
    })
  })

  describe('sendToSentry', () => {
    it('sends event to correct Sentry URL', async () => {
      const event = createTestEvent()

      await sendToSentry(event, {
        dsn: 'https://public@o123.ingest.sentry.io/456',
      })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://o123.ingest.sentry.io/api/456/store/')
    })

    it('supports DSNs with path prefixes', async () => {
      const event = createTestEvent()

      await sendToSentry(event, {
        dsn: 'https://public@localhost:8080/sentry/456',
      })

      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://localhost:8080/sentry/api/456/store/')
    })

    it('sets Sentry auth header', async () => {
      const event = createTestEvent()

      await sendToSentry(event, {
        dsn: 'https://public@o123.ingest.sentry.io/456',
      })

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(options.headers).toEqual(expect.objectContaining({
        'X-Sentry-Auth': expect.stringContaining('sentry_key=public'),
      }))
    })

    it('sends valid event payload', async () => {
      const event = createTestEvent({ level: 'error', message: 'boom' })

      await sendToSentry(event, {
        dsn: 'https://public@o123.ingest.sentry.io/456',
      })

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(options.body as string)
      expect(body.level).toBe('error')
      expect(body.message).toBe('boom')
      expect(body.event_id).toMatch(/^[a-f0-9]{32}$/)
    })

    it('throws error on non-OK response', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response('Bad Request', { status: 400, statusText: 'Bad Request' }),
      )

      const event = createTestEvent()

      await expect(sendToSentry(event, {
        dsn: 'https://public@o123.ingest.sentry.io/456',
      })).rejects.toThrow('Sentry API error: 400 Bad Request')
    })
  })

  describe('sendBatchToSentry', () => {
    it('sends each event sequentially', async () => {
      const events = [
        createTestEvent({ requestId: '1' }),
        createTestEvent({ requestId: '2' }),
      ]

      await sendBatchToSentry(events, {
        dsn: 'https://public@o123.ingest.sentry.io/456',
      })

      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('does not send request for empty events array', async () => {
      await sendBatchToSentry([], {
        dsn: 'https://public@o123.ingest.sentry.io/456',
      })

      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })
})
