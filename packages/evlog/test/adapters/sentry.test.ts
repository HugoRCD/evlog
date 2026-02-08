import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WideEvent } from '../../src/types'
import { sendBatchToSentry, sendToSentry, toSentryLog } from '../../src/adapters/sentry'

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

  describe('toSentryLog', () => {
    it('converts timestamp to unix seconds', () => {
      const event = createTestEvent()
      const result = toSentryLog(event, { dsn: 'https://public@o0.ingest.sentry.io/123' })

      expect(result.timestamp).toBe(new Date('2024-01-01T12:00:00.000Z').getTime() / 1000)
    })

    it('maps severity numbers correctly', () => {
      const levels = { debug: 5, info: 9, warn: 13, error: 17 } as const

      for (const [level, expectedSeverity] of Object.entries(levels)) {
        const event = createTestEvent({ level: level as WideEvent['level'] })
        const result = toSentryLog(event, { dsn: 'https://public@o0.ingest.sentry.io/123' })

        expect(result.severity_number).toBe(expectedSeverity)
        expect(result.level).toBe(level)
      }
    })

    it('keeps warn as warn (not warning)', () => {
      const event = createTestEvent({ level: 'warn' })
      const result = toSentryLog(event, { dsn: 'https://public@o0.ingest.sentry.io/123' })

      expect(result.level).toBe('warn')
    })

    it('uses event message as body', () => {
      const event = createTestEvent({ message: 'Order created' })
      const result = toSentryLog(event, { dsn: 'https://public@o0.ingest.sentry.io/123' })

      expect(result.body).toBe('Order created')
    })

    it('falls back to action then path for body', () => {
      const eventWithAction = createTestEvent({ action: 'checkout' })
      expect(toSentryLog(eventWithAction, { dsn: 'https://public@o0.ingest.sentry.io/123' }).body).toBe('checkout')

      const eventWithPath = createTestEvent({ path: '/api/users' })
      expect(toSentryLog(eventWithPath, { dsn: 'https://public@o0.ingest.sentry.io/123' }).body).toBe('/api/users')
    })

    it('uses default body when no message/action/path', () => {
      const event = createTestEvent()
      const result = toSentryLog(event, { dsn: 'https://public@o0.ingest.sentry.io/123' })

      expect(result.body).toBe('evlog wide event')
    })

    it('generates a 32-char hex trace_id', () => {
      const event = createTestEvent()
      const result = toSentryLog(event, { dsn: 'https://public@o0.ingest.sentry.io/123' })

      expect(result.trace_id).toMatch(/^[a-f0-9]{32}$/)
    })

    it('uses event traceId when available', () => {
      const event = createTestEvent({ traceId: 'abcdef1234567890abcdef1234567890' })
      const result = toSentryLog(event, { dsn: 'https://public@o0.ingest.sentry.io/123' })

      expect(result.trace_id).toBe('abcdef1234567890abcdef1234567890')
    })

    it('includes service as typed attribute', () => {
      const event = createTestEvent()
      const result = toSentryLog(event, { dsn: 'https://public@o0.ingest.sentry.io/123' })

      expect(result.attributes?.service).toEqual({ value: 'test-service', type: 'string' })
    })

    it('includes sentry.environment attribute', () => {
      const event = createTestEvent()
      const result = toSentryLog(event, { dsn: 'https://public@o0.ingest.sentry.io/123' })

      expect(result.attributes?.['sentry.environment']).toEqual({ value: 'test', type: 'string' })
    })

    it('uses config environment over event environment', () => {
      const event = createTestEvent({ environment: 'staging' })
      const result = toSentryLog(event, {
        dsn: 'https://public@o0.ingest.sentry.io/123',
        environment: 'production',
      })

      expect(result.attributes?.['sentry.environment']).toEqual({ value: 'production', type: 'string' })
    })

    it('types attributes correctly', () => {
      const event = createTestEvent({
        requestId: 'req-123',
        duration: 234,
        ratio: 0.75,
        success: true,
        nested: { key: 'value' },
      })
      const result = toSentryLog(event, { dsn: 'https://public@o0.ingest.sentry.io/123' })

      expect(result.attributes?.requestId).toEqual({ value: 'req-123', type: 'string' })
      expect(result.attributes?.duration).toEqual({ value: 234, type: 'integer' })
      expect(result.attributes?.ratio).toEqual({ value: 0.75, type: 'double' })
      expect(result.attributes?.success).toEqual({ value: true, type: 'boolean' })
      expect(result.attributes?.nested).toEqual({ value: '{"key":"value"}', type: 'string' })
    })

    it('includes custom tags from config as attributes', () => {
      const event = createTestEvent()
      const result = toSentryLog(event, {
        dsn: 'https://public@o0.ingest.sentry.io/123',
        tags: { team: 'backend', region: 'eu' },
      })

      expect(result.attributes?.team).toEqual({ value: 'backend', type: 'string' })
      expect(result.attributes?.region).toEqual({ value: 'eu', type: 'string' })
    })

    it('excludes traceId and spanId from attributes', () => {
      const event = createTestEvent({ traceId: 'abc123', spanId: 'def456' })
      const result = toSentryLog(event, { dsn: 'https://public@o0.ingest.sentry.io/123' })

      expect(result.attributes?.traceId).toBeUndefined()
      expect(result.attributes?.spanId).toBeUndefined()
    })
  })

  describe('sendToSentry', () => {
    it('sends log to correct Sentry envelope URL', async () => {
      const event = createTestEvent()

      await sendToSentry(event, {
        dsn: 'https://public@o123.ingest.sentry.io/456',
      })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://o123.ingest.sentry.io/api/456/envelope/')
    })

    it('supports DSNs with path prefixes', async () => {
      const event = createTestEvent()

      await sendToSentry(event, {
        dsn: 'https://public@localhost:8080/sentry/456',
      })

      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://localhost:8080/sentry/api/456/envelope/')
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

    it('sets Content-Type to application/x-sentry-envelope', async () => {
      const event = createTestEvent()

      await sendToSentry(event, {
        dsn: 'https://public@o123.ingest.sentry.io/456',
      })

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(options.headers).toEqual(expect.objectContaining({
        'Content-Type': 'application/x-sentry-envelope',
      }))
    })

    it('sends valid log envelope payload', async () => {
      const event = createTestEvent({ level: 'error', message: 'boom' })

      await sendToSentry(event, {
        dsn: 'https://public@o123.ingest.sentry.io/456',
      })

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const lines = (options.body as string).split('\n').filter(line => line.length > 0)

      const envelopeHeader = JSON.parse(lines[0])
      expect(envelopeHeader.dsn).toBe('https://public@o123.ingest.sentry.io/456')
      expect(envelopeHeader.sent_at).toBeDefined()

      const itemHeader = JSON.parse(lines[1])
      expect(itemHeader.type).toBe('log')
      expect(itemHeader.item_count).toBe(1)
      expect(itemHeader.content_type).toBe('application/vnd.sentry.items.log+json')

      const itemPayload = JSON.parse(lines[2])
      expect(itemPayload.items).toHaveLength(1)

      const [log] = itemPayload.items
      expect(log.level).toBe('error')
      expect(log.severity_number).toBe(17)
      expect(log.body).toBe('boom')
      expect(log.trace_id).toMatch(/^[a-f0-9]{32}$/)
      expect(log.timestamp).toBeGreaterThan(0)
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
    it('sends multiple logs in a single request', async () => {
      const events = [
        createTestEvent({ requestId: '1' }),
        createTestEvent({ requestId: '2' }),
        createTestEvent({ requestId: '3' }),
      ]

      await sendBatchToSentry(events, {
        dsn: 'https://public@o123.ingest.sentry.io/456',
      })

      expect(fetchSpy).toHaveBeenCalledTimes(1)

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const lines = (options.body as string).split('\n').filter(line => line.length > 0)

      const itemHeader = JSON.parse(lines[1])
      expect(itemHeader.item_count).toBe(3)

      const itemPayload = JSON.parse(lines[2])
      expect(itemPayload.items).toHaveLength(3)
    })

    it('does not send request for empty events array', async () => {
      await sendBatchToSentry([], {
        dsn: 'https://public@o123.ingest.sentry.io/456',
      })

      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })

  describe('timeout handling', () => {
    it('uses default timeout of 5000ms', async () => {
      const event = createTestEvent()
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

      await sendToSentry(event, {
        dsn: 'https://public@o123.ingest.sentry.io/456',
      })

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5000)
    })

    it('uses custom timeout when provided', async () => {
      const event = createTestEvent()
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

      await sendToSentry(event, {
        dsn: 'https://public@o123.ingest.sentry.io/456',
        timeout: 10000,
      })

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 10000)
    })
  })
})
