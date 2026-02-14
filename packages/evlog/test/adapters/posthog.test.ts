import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WideEvent } from '../../src/types'
import { createPostHogLogsDrain, sendBatchToPostHog, sendToPostHog, toPostHogEvent } from '../../src/adapters/posthog'

describe('posthog adapter', () => {
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

  describe('toPostHogEvent', () => {
    it('uses default event name', () => {
      const event = createTestEvent()
      const result = toPostHogEvent(event, { apiKey: 'phc_test' })

      expect(result.event).toBe('evlog_wide_event')
    })

    it('uses custom event name from config', () => {
      const event = createTestEvent()
      const result = toPostHogEvent(event, { apiKey: 'phc_test', eventName: 'custom_event' })

      expect(result.event).toBe('custom_event')
    })

    it('uses service as distinct_id by default', () => {
      const event = createTestEvent({ service: 'my-service' })
      const result = toPostHogEvent(event, { apiKey: 'phc_test' })

      expect(result.distinct_id).toBe('my-service')
    })

    it('uses custom distinct_id from config', () => {
      const event = createTestEvent({ service: 'my-service' })
      const result = toPostHogEvent(event, { apiKey: 'phc_test', distinctId: 'user-123' })

      expect(result.distinct_id).toBe('user-123')
    })

    it('preserves event timestamp', () => {
      const event = createTestEvent({ timestamp: '2024-06-15T08:30:00.000Z' })
      const result = toPostHogEvent(event, { apiKey: 'phc_test' })

      expect(result.timestamp).toBe('2024-06-15T08:30:00.000Z')
    })

    it('includes level and service in properties', () => {
      const event = createTestEvent({ level: 'error', service: 'api' })
      const result = toPostHogEvent(event, { apiKey: 'phc_test' })

      expect(result.properties.level).toBe('error')
      expect(result.properties.service).toBe('api')
    })

    it('includes extra event fields in properties', () => {
      const event = createTestEvent({ action: 'checkout', userId: '456', duration: 120 })
      const result = toPostHogEvent(event, { apiKey: 'phc_test' })

      expect(result.properties.action).toBe('checkout')
      expect(result.properties.userId).toBe('456')
      expect(result.properties.duration).toBe(120)
    })

    it('includes environment in properties', () => {
      const event = createTestEvent({ environment: 'production' })
      const result = toPostHogEvent(event, { apiKey: 'phc_test' })

      expect(result.properties.environment).toBe('production')
    })

    it('uses userId as distinct_id when no config distinctId', () => {
      const event = createTestEvent({ userId: 'usr_123' })
      const result = toPostHogEvent(event, { apiKey: 'phc_test' })

      expect(result.distinct_id).toBe('usr_123')
    })

    it('config distinctId takes priority over event userId', () => {
      const event = createTestEvent({ userId: 'usr_123' })
      const result = toPostHogEvent(event, { apiKey: 'phc_test', distinctId: 'config-id' })

      expect(result.distinct_id).toBe('config-id')
    })

    it('falls back to service when userId is not a string', () => {
      const event = createTestEvent({ userId: 42 })
      const result = toPostHogEvent(event, { apiKey: 'phc_test' })

      expect(result.distinct_id).toBe('test-service')
    })
  })

  describe('sendToPostHog', () => {
    it('sends event to correct PostHog URL', async () => {
      const event = createTestEvent()

      await sendToPostHog(event, {
        apiKey: 'phc_test',
      })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://us.i.posthog.com/batch/')
    })

    it('uses custom host when provided', async () => {
      const event = createTestEvent()

      await sendToPostHog(event, {
        apiKey: 'phc_test',
        host: 'https://eu.i.posthog.com',
      })

      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://eu.i.posthog.com/batch/')
    })

    it('handles host with trailing slash', async () => {
      const event = createTestEvent()

      await sendToPostHog(event, {
        apiKey: 'phc_test',
        host: 'https://eu.i.posthog.com/',
      })

      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://eu.i.posthog.com/batch/')
    })

    it('supports self-hosted PostHog', async () => {
      const event = createTestEvent()

      await sendToPostHog(event, {
        apiKey: 'phc_test',
        host: 'https://posthog.mycompany.com',
      })

      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://posthog.mycompany.com/batch/')
    })

    it('sets Content-Type to application/json', async () => {
      const event = createTestEvent()

      await sendToPostHog(event, {
        apiKey: 'phc_test',
      })

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(options.headers).toEqual(expect.objectContaining({
        'Content-Type': 'application/json',
      }))
    })

    it('includes api_key in body', async () => {
      const event = createTestEvent()

      await sendToPostHog(event, {
        apiKey: 'phc_my_secret_key',
      })

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(options.body as string)
      expect(body.api_key).toBe('phc_my_secret_key')
    })

    it('sends event in batch array', async () => {
      const event = createTestEvent({ action: 'test-action', userId: '123' })

      await sendToPostHog(event, {
        apiKey: 'phc_test',
      })

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(options.body as string)
      expect(body.batch).toHaveLength(1)
      expect(body.batch[0].event).toBe('evlog_wide_event')
      expect(body.batch[0].distinct_id).toBe('123')
      expect(body.batch[0].properties.action).toBe('test-action')
    })

    it('throws error on non-OK response', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response('Bad Request', { status: 400, statusText: 'Bad Request' }),
      )

      const event = createTestEvent()

      await expect(sendToPostHog(event, {
        apiKey: 'phc_test',
      })).rejects.toThrow('PostHog API error: 400 Bad Request')
    })
  })

  describe('sendBatchToPostHog', () => {
    it('sends multiple events in a single request', async () => {
      const events = [
        createTestEvent({ requestId: '1' }),
        createTestEvent({ requestId: '2' }),
        createTestEvent({ requestId: '3' }),
      ]

      await sendBatchToPostHog(events, {
        apiKey: 'phc_test',
      })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(options.body as string)
      expect(body.batch).toHaveLength(3)
    })

    it('does not send request for empty events array', async () => {
      await sendBatchToPostHog([], {
        apiKey: 'phc_test',
      })

      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('includes api_key at top level of batch payload', async () => {
      const events = [createTestEvent()]

      await sendBatchToPostHog(events, {
        apiKey: 'phc_batch_key',
      })

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(options.body as string)
      expect(body.api_key).toBe('phc_batch_key')
    })
  })

  describe('timeout handling', () => {
    it('uses default timeout of 5000ms', async () => {
      const event = createTestEvent()
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

      await sendToPostHog(event, {
        apiKey: 'phc_test',
      })

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5000)
    })

    it('uses custom timeout when provided', async () => {
      const event = createTestEvent()
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

      await sendToPostHog(event, {
        apiKey: 'phc_test',
        timeout: 10000,
      })

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 10000)
    })
  })

  describe('createPostHogLogsDrain', () => {
    const createDrainContext = (overrides?: Partial<WideEvent>) => ({
      event: createTestEvent(overrides),
    })

    afterEach(() => {
      delete process.env.NUXT_POSTHOG_API_KEY
      delete process.env.POSTHOG_API_KEY
      delete process.env.NUXT_POSTHOG_HOST
      delete process.env.POSTHOG_HOST
    })

    it('sends to correct OTLP endpoint', async () => {
      const drain = createPostHogLogsDrain({ apiKey: 'phc_test' })
      await drain(createDrainContext())

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://us.i.posthog.com/i/v1/logs')
    })

    it('sets Authorization header with Bearer token', async () => {
      const drain = createPostHogLogsDrain({ apiKey: 'phc_my_key' })
      await drain(createDrainContext())

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(options.headers).toEqual(expect.objectContaining({
        Authorization: 'Bearer phc_my_key',
      }))
    })

    it('sends OTLP log record format in payload', async () => {
      const drain = createPostHogLogsDrain({ apiKey: 'phc_test' })
      await drain(createDrainContext({ action: 'checkout' }))

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const payload = JSON.parse(options.body as string)

      expect(payload).toHaveProperty('resourceLogs')
      expect(payload.resourceLogs).toHaveLength(1)
      expect(payload.resourceLogs[0]).toHaveProperty('resource')
      expect(payload.resourceLogs[0]).toHaveProperty('scopeLogs')
      const [, { logRecords }] = payload.resourceLogs[0].scopeLogs
      expect(logRecords).toHaveLength(1)
      expect(logRecords[0]).toHaveProperty('timeUnixNano')
      expect(logRecords[0]).toHaveProperty('severityNumber')
      expect(logRecords[0]).toHaveProperty('severityText')
      expect(logRecords[0]).toHaveProperty('body')
    })

    it('supports batch of events', async () => {
      const drain = createPostHogLogsDrain({ apiKey: 'phc_test' })
      await drain([
        createDrainContext({ requestId: '1' }),
        createDrainContext({ requestId: '2' }),
        createDrainContext({ requestId: '3' }),
      ])

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const payload = JSON.parse(options.body as string)
      expect(payload.resourceLogs[0].scopeLogs[0].logRecords).toHaveLength(3)
    })

    it('handles single context (non-array)', async () => {
      const drain = createPostHogLogsDrain({ apiKey: 'phc_test' })
      await drain(createDrainContext())

      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('skips empty array', async () => {
      const drain = createPostHogLogsDrain({ apiKey: 'phc_test' })
      await drain([])

      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('resolves apiKey from env var NUXT_POSTHOG_API_KEY', async () => {
      process.env.NUXT_POSTHOG_API_KEY = 'phc_from_env'
      const drain = createPostHogLogsDrain()
      await drain(createDrainContext())

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(options.headers).toEqual(expect.objectContaining({
        Authorization: 'Bearer phc_from_env',
      }))
    })

    it('resolves apiKey from env var POSTHOG_API_KEY as fallback', async () => {
      process.env.POSTHOG_API_KEY = 'phc_fallback'
      const drain = createPostHogLogsDrain()
      await drain(createDrainContext())

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(options.headers).toEqual(expect.objectContaining({
        Authorization: 'Bearer phc_fallback',
      }))
    })

    it('overrides take priority over env vars', async () => {
      process.env.NUXT_POSTHOG_API_KEY = 'phc_from_env'
      const drain = createPostHogLogsDrain({ apiKey: 'phc_override' })
      await drain(createDrainContext())

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(options.headers).toEqual(expect.objectContaining({
        Authorization: 'Bearer phc_override',
      }))
    })

    it('logs error when apiKey is missing', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const drain = createPostHogLogsDrain()
      await drain(createDrainContext())

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[evlog/posthog] Missing apiKey'),
      )
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('uses custom host for EU region', async () => {
      const drain = createPostHogLogsDrain({
        apiKey: 'phc_test',
        host: 'https://eu.i.posthog.com',
      })
      await drain(createDrainContext())

      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://eu.i.posthog.com/i/v1/logs')
    })

    it('uses custom host for self-hosted', async () => {
      const drain = createPostHogLogsDrain({
        apiKey: 'phc_test',
        host: 'https://posthog.mycompany.com',
      })
      await drain(createDrainContext())

      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://posthog.mycompany.com/i/v1/logs')
    })

    it('handles host with trailing slash', async () => {
      const drain = createPostHogLogsDrain({
        apiKey: 'phc_test',
        host: 'https://eu.i.posthog.com/',
      })
      await drain(createDrainContext())

      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://eu.i.posthog.com/i/v1/logs')
    })

    it('resolves host from env var', async () => {
      process.env.NUXT_POSTHOG_HOST = 'https://eu.i.posthog.com'
      const drain = createPostHogLogsDrain({ apiKey: 'phc_test' })
      await drain(createDrainContext())

      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://eu.i.posthog.com/i/v1/logs')
    })

    it('uses custom timeout', async () => {
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
      const drain = createPostHogLogsDrain({ apiKey: 'phc_test', timeout: 10000 })
      await drain(createDrainContext())

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 10000)
    })

    it('uses default timeout of 5000ms', async () => {
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
      const drain = createPostHogLogsDrain({ apiKey: 'phc_test' })
      await drain(createDrainContext())

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5000)
    })

    it('catches and logs errors from sendBatchToOTLP', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' }),
      )
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const drain = createPostHogLogsDrain({ apiKey: 'phc_test' })
      await drain(createDrainContext())

      expect(consoleSpy).toHaveBeenCalledWith(
        '[evlog/posthog] Failed to send logs to PostHog Logs:',
        expect.any(Error),
      )
    })
  })
})
