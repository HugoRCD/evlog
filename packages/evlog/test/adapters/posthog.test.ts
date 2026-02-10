import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WideEvent } from '../../src/types'
import { sendBatchToPostHog, sendToPostHog, toPostHogEvent } from '../../src/adapters/posthog'

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
      expect(body.batch[0].distinct_id).toBe('test-service')
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
})
