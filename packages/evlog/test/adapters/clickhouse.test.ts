import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WideEvent } from '../../src/types'
import { getFetchCall, getFetchHeaders, mockFetch } from '../helpers/fetch'
import {
  createClickHouseDrain,
  resolveClickHouseUrl,
  sendBatchToClickHouse,
  sendToClickHouse,
  toClickHouseDateTime,
  toClickHouseRow,
  toJSONEachRow,
} from '../../src/adapters/clickhouse'

const ENDPOINT = 'http://localhost:8123'

function createTestEvent(overrides?: Partial<WideEvent>): WideEvent {
  return {
    timestamp: '2024-01-01T12:00:00.000Z',
    level: 'info',
    service: 'api',
    environment: 'production',
    ...overrides,
  }
}

describe('clickhouse adapter', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = mockFetch()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.CLICKHOUSE_ENDPOINT
    delete process.env.CLICKHOUSE_USER
    delete process.env.CLICKHOUSE_PASSWORD
    delete process.env.CLICKHOUSE_DATABASE
    delete process.env.CLICKHOUSE_TABLE
  })

  describe('toClickHouseDateTime', () => {
    it('formats as DateTime64(3) text', () => {
      expect(toClickHouseDateTime('2024-01-01T12:00:00.000Z')).toBe('2024-01-01 12:00:00.000')
    })

    it('falls back to now for an unparseable timestamp', () => {
      expect(toClickHouseDateTime('nope')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/)
    })
  })

  describe('toClickHouseRow', () => {
    it('maps the documented columns', () => {
      const row = toClickHouseRow(createTestEvent({
        requestId: 'req-1',
        method: 'GET',
        path: '/api/users',
        status: 200,
        duration: '12ms',
        durationMs: 12,
      }))
      expect(row).toMatchObject({
        timestamp: '2024-01-01 12:00:00.000',
        level: 'info',
        service: 'api',
        environment: 'production',
        request_id: 'req-1',
        method: 'GET',
        path: '/api/users',
        status: 200,
        duration: '12ms',
        duration_ms: 12,
      })
    })

    it('keeps the complete event in the data column', () => {
      const event = createTestEvent({ user: { id: 'u-1' }, custom: [1, 2] })
      expect(JSON.parse(toClickHouseRow(event).data as string)).toEqual(event)
    })

    it('flattens structured errors into error_name / error_message', () => {
      const row = toClickHouseRow(createTestEvent({
        level: 'error',
        error: { name: 'PaymentDeclined', message: 'Card declined' },
      }))
      expect(row.error_name).toBe('PaymentDeclined')
      expect(row.error_message).toBe('Card declined')
    })

    it('uses empty strings and null rather than undefined for absent fields', () => {
      const row = toClickHouseRow(createTestEvent())
      expect(row.request_id).toBe('')
      expect(row.method).toBe('')
      expect(row.error_name).toBe('')
      expect(row.status).toBeNull()
      expect(row.duration_ms).toBeNull()
    })

    it('nulls a duration_ms that Nullable(UInt32) would reject', () => {
      for (const durationMs of [-1, 1.5, 4_294_967_296, Number.NaN, '12', null]) {
        expect(toClickHouseRow(createTestEvent({ durationMs })).duration_ms, String(durationMs)).toBeNull()
      }

      expect(toClickHouseRow(createTestEvent({ durationMs: 0 })).duration_ms).toBe(0)
      expect(toClickHouseRow(createTestEvent({ durationMs: 4_294_967_295 })).duration_ms).toBe(4_294_967_295)
    })

    it('ignores a non-numeric status', () => {
      expect(toClickHouseRow(createTestEvent({ status: 'ok' })).status).toBeNull()
    })

    it('carries trace context when present', () => {
      const row = toClickHouseRow(createTestEvent({ traceId: 'trace-1', spanId: 'span-1' }))
      expect(row.trace_id).toBe('trace-1')
      expect(row.span_id).toBe('span-1')
    })
  })

  describe('toJSONEachRow', () => {
    it('emits one JSON object per line', () => {
      const lines = toJSONEachRow([createTestEvent(), createTestEvent()]).split('\n')
      expect(lines).toHaveLength(2)
      expect(JSON.parse(lines[0]).service).toBe('api')
    })

    it('honors a custom transform', () => {
      const body = toJSONEachRow([createTestEvent()], event => ({ only: event.service }))
      expect(JSON.parse(body)).toEqual({ only: 'api' })
    })
  })

  describe('resolveClickHouseUrl', () => {
    it('builds the INSERT query with defaults', () => {
      const url = new URL(resolveClickHouseUrl({ endpoint: ENDPOINT }))
      expect(url.origin).toBe(ENDPOINT)
      expect(url.searchParams.get('database')).toBe('default')
      expect(url.searchParams.get('query')).toBe('INSERT INTO evlog_events FORMAT JSONEachRow')
    })

    it('honors database and table overrides', () => {
      const url = new URL(resolveClickHouseUrl({ endpoint: ENDPOINT, database: 'logs', table: 'events' }))
      expect(url.searchParams.get('database')).toBe('logs')
      expect(url.searchParams.get('query')).toBe('INSERT INTO events FORMAT JSONEachRow')
    })

    it('enables fire-and-forget async inserts by default', () => {
      const url = new URL(resolveClickHouseUrl({ endpoint: ENDPOINT }))
      expect(url.searchParams.get('async_insert')).toBe('1')
      expect(url.searchParams.get('wait_for_async_insert')).toBe('0')
    })

    it('can wait for the async insert to flush', () => {
      const url = new URL(resolveClickHouseUrl({ endpoint: ENDPOINT, waitForAsyncInsert: true }))
      expect(url.searchParams.get('wait_for_async_insert')).toBe('1')
    })

    it('omits async insert settings when disabled', () => {
      const url = new URL(resolveClickHouseUrl({ endpoint: ENDPOINT, asyncInsert: false }))
      expect(url.searchParams.get('async_insert')).toBeNull()
      expect(url.searchParams.get('wait_for_async_insert')).toBeNull()
    })

    it('trims trailing slashes from the endpoint', () => {
      expect(resolveClickHouseUrl({ endpoint: 'http://localhost:8123///' })).toContain('http://localhost:8123/?')
    })
  })

  describe('authentication', () => {
    it('sends credentials as headers, never in the query string', async () => {
      await sendToClickHouse(createTestEvent(), { endpoint: ENDPOINT, username: 'writer', password: 's3cret' })
      const headers = getFetchHeaders(fetchSpy)
      expect(headers['X-ClickHouse-User']).toBe('writer')
      expect(headers['X-ClickHouse-Key']).toBe('s3cret')
      expect(new URL(getFetchCall(fetchSpy).url).search).not.toContain('s3cret')
    })

    it('defaults the username and omits the key when no password is set', async () => {
      await sendToClickHouse(createTestEvent(), { endpoint: ENDPOINT })
      const headers = getFetchHeaders(fetchSpy)
      expect(headers['X-ClickHouse-User']).toBe('default')
      expect(headers['X-ClickHouse-Key']).toBeUndefined()
    })

    it('sends the NDJSON content type', async () => {
      await sendToClickHouse(createTestEvent(), { endpoint: ENDPOINT })
      expect(getFetchHeaders(fetchSpy)['Content-Type']).toBe('application/x-ndjson')
    })
  })

  describe('sendBatchToClickHouse', () => {
    it('inserts a batch in one request', async () => {
      await sendBatchToClickHouse([createTestEvent(), createTestEvent()], { endpoint: ENDPOINT })
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect((getFetchCall(fetchSpy).init.body as string).split('\n')).toHaveLength(2)
    })

    it('is a no-op for an empty batch', async () => {
      await sendBatchToClickHouse([], { endpoint: ENDPOINT })
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('throws a labelled error on a non-OK response', async () => {
      fetchSpy.mockResolvedValue(new Response('syntax error', { status: 400, statusText: 'Bad Request' }))
      await expect(sendBatchToClickHouse([createTestEvent()], { endpoint: ENDPOINT, retries: 0 }))
        .rejects.toThrow('ClickHouse API error: 400 Bad Request')
    })
  })

  describe('createClickHouseDrain', () => {
    it('resolves configuration from env', async () => {
      process.env.CLICKHOUSE_ENDPOINT = ENDPOINT
      process.env.CLICKHOUSE_DATABASE = 'logs'
      process.env.CLICKHOUSE_TABLE = 'events'
      process.env.CLICKHOUSE_PASSWORD = 'from-env'

      await createClickHouseDrain()({ event: createTestEvent() })

      const url = new URL(getFetchCall(fetchSpy).url)
      expect(url.searchParams.get('database')).toBe('logs')
      expect(url.searchParams.get('query')).toContain('INSERT INTO events')
      expect(getFetchHeaders(fetchSpy)['X-ClickHouse-Key']).toBe('from-env')
    })

    it('skips draining and reports when the endpoint is missing', async () => {
      await createClickHouseDrain()({ event: createTestEvent() })
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[evlog/clickhouse] Missing endpoint'))
    })

    it('accepts a batch of drain contexts', async () => {
      await createClickHouseDrain({ endpoint: ENDPOINT })([
        { event: createTestEvent({ path: '/a' }) },
        { event: createTestEvent({ path: '/b' }) },
      ])
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect((getFetchCall(fetchSpy).init.body as string).split('\n')).toHaveLength(2)
    })

    it('applies a custom transform', async () => {
      await createClickHouseDrain({
        endpoint: ENDPOINT,
        transform: event => ({ ts: event.timestamp, svc: event.service }),
      })({ event: createTestEvent() })
      expect(JSON.parse((getFetchCall(fetchSpy).init.body as string))).toEqual({ ts: '2024-01-01T12:00:00.000Z', svc: 'api' })
    })

    it('never throws when the insert fails', async () => {
      fetchSpy.mockResolvedValue(new Response('boom', { status: 500, statusText: 'Server Error' }))
      await expect(createClickHouseDrain({ endpoint: ENDPOINT, retries: 0 })({ event: createTestEvent() }))
        .resolves.toBeUndefined()
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('[evlog/clickhouse] Failed to send events:'),
        expect.anything(),
      )
    })
  })
})
