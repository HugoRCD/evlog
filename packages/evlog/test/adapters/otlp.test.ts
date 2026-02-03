import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WideEvent } from '../../src/types'
import { sendBatchToOTLP, sendToOTLP, toOTLPLogRecord } from '../../src/adapters/otlp'

describe('otlp adapter', () => {
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

  describe('toOTLPLogRecord', () => {
    it('converts timestamp to nanoseconds', () => {
      const event = createTestEvent({ timestamp: '2024-01-01T12:00:00.000Z' })
      const record = toOTLPLogRecord(event)

      const expectedNanos = new Date('2024-01-01T12:00:00.000Z').getTime() * 1_000_000
      expect(record.timeUnixNano).toBe(String(expectedNanos))
    })

    it('maps debug level to severity 5', () => {
      const event = createTestEvent({ level: 'debug' })
      const record = toOTLPLogRecord(event)

      expect(record.severityNumber).toBe(5)
      expect(record.severityText).toBe('DEBUG')
    })

    it('maps info level to severity 9', () => {
      const event = createTestEvent({ level: 'info' })
      const record = toOTLPLogRecord(event)

      expect(record.severityNumber).toBe(9)
      expect(record.severityText).toBe('INFO')
    })

    it('maps warn level to severity 13', () => {
      const event = createTestEvent({ level: 'warn' })
      const record = toOTLPLogRecord(event)

      expect(record.severityNumber).toBe(13)
      expect(record.severityText).toBe('WARN')
    })

    it('maps error level to severity 17', () => {
      const event = createTestEvent({ level: 'error' })
      const record = toOTLPLogRecord(event)

      expect(record.severityNumber).toBe(17)
      expect(record.severityText).toBe('ERROR')
    })

    it('includes full event as JSON body', () => {
      const event = createTestEvent({ action: 'test', userId: '123' })
      const record = toOTLPLogRecord(event)

      expect(record.body.stringValue).toBe(JSON.stringify(event))
    })

    it('converts string attributes correctly', () => {
      const event = createTestEvent({ action: 'test-action' })
      const record = toOTLPLogRecord(event)

      const actionAttr = record.attributes.find(a => a.key === 'action')
      expect(actionAttr?.value).toEqual({ stringValue: 'test-action' })
    })

    it('converts integer attributes correctly', () => {
      const event = createTestEvent({ count: 42 })
      const record = toOTLPLogRecord(event)

      const countAttr = record.attributes.find(a => a.key === 'count')
      expect(countAttr?.value).toEqual({ intValue: '42' })
    })

    it('converts boolean attributes correctly', () => {
      const event = createTestEvent({ success: true })
      const record = toOTLPLogRecord(event)

      const successAttr = record.attributes.find(a => a.key === 'success')
      expect(successAttr?.value).toEqual({ boolValue: true })
    })

    it('converts complex objects to JSON strings', () => {
      const event = createTestEvent({ user: { id: '123', name: 'Alice' } })
      const record = toOTLPLogRecord(event)

      const userAttr = record.attributes.find(a => a.key === 'user')
      expect(userAttr?.value).toEqual({ stringValue: '{"id":"123","name":"Alice"}' })
    })

    it('includes traceId when present', () => {
      const event = createTestEvent({ traceId: 'abc123' })
      const record = toOTLPLogRecord(event)

      expect(record.traceId).toBe('abc123')
    })

    it('includes spanId when present', () => {
      const event = createTestEvent({ spanId: 'span456' })
      const record = toOTLPLogRecord(event)

      expect(record.spanId).toBe('span456')
    })

    it('excludes null and undefined attributes', () => {
      const event = createTestEvent({ nullValue: null, undefinedValue: undefined })
      const record = toOTLPLogRecord(event)

      expect(record.attributes.find(a => a.key === 'nullValue')).toBeUndefined()
      expect(record.attributes.find(a => a.key === 'undefinedValue')).toBeUndefined()
    })

    it('excludes base fields from attributes', () => {
      const event = createTestEvent({
        version: '1.0.0',
        commitHash: 'abc123',
        region: 'us-east-1',
      })
      const record = toOTLPLogRecord(event)

      expect(record.attributes.find(a => a.key === 'timestamp')).toBeUndefined()
      expect(record.attributes.find(a => a.key === 'level')).toBeUndefined()
      expect(record.attributes.find(a => a.key === 'service')).toBeUndefined()
      expect(record.attributes.find(a => a.key === 'environment')).toBeUndefined()
      expect(record.attributes.find(a => a.key === 'version')).toBeUndefined()
      expect(record.attributes.find(a => a.key === 'commitHash')).toBeUndefined()
      expect(record.attributes.find(a => a.key === 'region')).toBeUndefined()
    })
  })

  describe('sendToOTLP', () => {
    it('sends to correct OTLP URL', async () => {
      const event = createTestEvent()

      await sendToOTLP(event, {
        endpoint: 'http://localhost:4318',
      })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('http://localhost:4318/v1/logs')
    })

    it('handles endpoint with trailing slash', async () => {
      const event = createTestEvent()

      await sendToOTLP(event, {
        endpoint: 'http://localhost:4318/',
      })

      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('http://localhost:4318/v1/logs')
    })

    it('sets Content-Type to application/json', async () => {
      const event = createTestEvent()

      await sendToOTLP(event, {
        endpoint: 'http://localhost:4318',
      })

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(options.headers).toEqual(expect.objectContaining({
        'Content-Type': 'application/json',
      }))
    })

    it('includes custom headers', async () => {
      const event = createTestEvent()

      await sendToOTLP(event, {
        endpoint: 'http://localhost:4318',
        headers: {
          'Authorization': 'Basic test-token',
          'X-Custom-Header': 'custom-value',
        },
      })

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(options.headers).toEqual(expect.objectContaining({
        'Authorization': 'Basic test-token',
        'X-Custom-Header': 'custom-value',
      }))
    })

    it('sends valid OTLP payload structure', async () => {
      const event = createTestEvent()

      await sendToOTLP(event, {
        endpoint: 'http://localhost:4318',
      })

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const payload = JSON.parse(options.body as string)

      expect(payload).toHaveProperty('resourceLogs')
      expect(payload.resourceLogs).toHaveLength(1)
      expect(payload.resourceLogs[0]).toHaveProperty('resource')
      expect(payload.resourceLogs[0]).toHaveProperty('scopeLogs')
      expect(payload.resourceLogs[0].scopeLogs[0]).toHaveProperty('scope')
      expect(payload.resourceLogs[0].scopeLogs[0]).toHaveProperty('logRecords')
    })

    it('includes service.name in resource attributes', async () => {
      const event = createTestEvent({ service: 'my-service' })

      await sendToOTLP(event, {
        endpoint: 'http://localhost:4318',
      })

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const payload = JSON.parse(options.body as string)
      const resourceAttrs = payload.resourceLogs[0].resource.attributes

      const serviceAttr = resourceAttrs.find((a: { key: string }) => a.key === 'service.name')
      expect(serviceAttr?.value).toEqual({ stringValue: 'my-service' })
    })

    it('overrides service.name from config', async () => {
      const event = createTestEvent({ service: 'original-service' })

      await sendToOTLP(event, {
        endpoint: 'http://localhost:4318',
        serviceName: 'override-service',
      })

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const payload = JSON.parse(options.body as string)
      const resourceAttrs = payload.resourceLogs[0].resource.attributes

      const serviceAttr = resourceAttrs.find((a: { key: string }) => a.key === 'service.name')
      expect(serviceAttr?.value).toEqual({ stringValue: 'override-service' })
    })

    it('includes deployment.environment in resource attributes', async () => {
      const event = createTestEvent({ environment: 'production' })

      await sendToOTLP(event, {
        endpoint: 'http://localhost:4318',
      })

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const payload = JSON.parse(options.body as string)
      const resourceAttrs = payload.resourceLogs[0].resource.attributes

      const envAttr = resourceAttrs.find((a: { key: string }) => a.key === 'deployment.environment')
      expect(envAttr?.value).toEqual({ stringValue: 'production' })
    })

    it('includes custom resource attributes from config', async () => {
      const event = createTestEvent()

      await sendToOTLP(event, {
        endpoint: 'http://localhost:4318',
        resourceAttributes: {
          'custom.string': 'value',
          'custom.number': 42,
          'custom.bool': true,
        },
      })

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const payload = JSON.parse(options.body as string)
      const resourceAttrs = payload.resourceLogs[0].resource.attributes

      expect(resourceAttrs.find((a: { key: string }) => a.key === 'custom.string')?.value).toEqual({ stringValue: 'value' })
      expect(resourceAttrs.find((a: { key: string }) => a.key === 'custom.number')?.value).toEqual({ intValue: '42' })
      expect(resourceAttrs.find((a: { key: string }) => a.key === 'custom.bool')?.value).toEqual({ boolValue: true })
    })

    it('includes scope with name evlog', async () => {
      const event = createTestEvent()

      await sendToOTLP(event, {
        endpoint: 'http://localhost:4318',
      })

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const payload = JSON.parse(options.body as string)
      const [{ scope }] = payload.resourceLogs[0].scopeLogs

      expect(scope.name).toBe('evlog')
      expect(scope.version).toBe('1.0.0')
    })

    it('throws error on non-OK response', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' }),
      )

      const event = createTestEvent()

      await expect(sendToOTLP(event, {
        endpoint: 'http://localhost:4318',
      })).rejects.toThrow('OTLP API error: 500 Internal Server Error')
    })
  })

  describe('sendBatchToOTLP', () => {
    it('sends multiple events in a single request', async () => {
      const events = [
        createTestEvent({ requestId: '1' }),
        createTestEvent({ requestId: '2' }),
        createTestEvent({ requestId: '3' }),
      ]

      await sendBatchToOTLP(events, {
        endpoint: 'http://localhost:4318',
      })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const payload = JSON.parse(options.body as string)

      expect(payload.resourceLogs[0].scopeLogs[0].logRecords).toHaveLength(3)
    })

    it('does not send request for empty events array', async () => {
      await sendBatchToOTLP([], {
        endpoint: 'http://localhost:4318',
      })

      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })

  describe('timeout handling', () => {
    it('uses default timeout of 5000ms', async () => {
      const event = createTestEvent()
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

      await sendToOTLP(event, {
        endpoint: 'http://localhost:4318',
      })

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5000)
    })

    it('uses custom timeout when provided', async () => {
      const event = createTestEvent()
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

      await sendToOTLP(event, {
        endpoint: 'http://localhost:4318',
        timeout: 10000,
      })

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 10000)
    })
  })
})
