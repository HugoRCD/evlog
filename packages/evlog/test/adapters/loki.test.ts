import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WideEvent } from '../../src/types'
import { getFetchCall, getFetchHeaders, getFetchJson, mockFetch } from '../helpers/fetch'
import {
  buildLokiPayload,
  createLokiDrain,
  resolveLokiPushUrl,
  sendBatchToLoki,
  sendToLoki,
  toLokiLabels,
  toLokiTimestamp,
} from '../../src/adapters/loki'

const ENDPOINT = 'http://localhost:3100'

function createTestEvent(overrides?: Partial<WideEvent>): WideEvent {
  return {
    timestamp: '2024-01-01T12:00:00.000Z',
    level: 'info',
    service: 'api',
    environment: 'production',
    ...overrides,
  }
}

describe('loki adapter', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = mockFetch(new Response(null, { status: 204 }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.LOKI_ENDPOINT
    delete process.env.LOKI_API_KEY
    delete process.env.LOKI_USER
    delete process.env.LOKI_TENANT_ID
  })

  describe('resolveLokiPushUrl', () => {
    it('appends the push path', () => {
      expect(resolveLokiPushUrl(ENDPOINT)).toBe('http://localhost:3100/loki/api/v1/push')
    })

    it('trims trailing slashes', () => {
      expect(resolveLokiPushUrl('http://localhost:3100///')).toBe('http://localhost:3100/loki/api/v1/push')
    })

    it('does not double-append when the endpoint already carries the path', () => {
      const full = 'http://localhost:3100/loki/api/v1/push'
      expect(resolveLokiPushUrl(full)).toBe(full)
    })
  })

  describe('toLokiTimestamp', () => {
    it('converts an ISO timestamp to nanosecond epoch', () => {
      expect(toLokiTimestamp('2024-01-01T12:00:00.000Z')).toBe('1704110400000000000')
    })

    it('falls back to now for an unparseable timestamp', () => {
      expect(toLokiTimestamp('not-a-date')).toMatch(/^\d+000000$/)
    })
  })

  describe('toLokiLabels', () => {
    it('promotes service, environment and level by default', () => {
      expect(toLokiLabels(createTestEvent(), {})).toEqual({
        service: 'api',
        environment: 'production',
        level: 'info',
      })
    })

    it('merges static labels', () => {
      const labels = toLokiLabels(createTestEvent(), { labels: { region: 'eu-west-1' } })
      expect(labels.region).toBe('eu-west-1')
      expect(labels.service).toBe('api')
    })

    it('honors a custom labelFields list', () => {
      const event = createTestEvent({ tier: 'premium' })
      const labels = toLokiLabels(event, { labelFields: ['service', 'tier'] })
      expect(labels).toEqual({ service: 'api', tier: 'premium' })
      expect(labels.level).toBeUndefined()
    })

    it('skips object-valued fields that would explode cardinality', () => {
      const event = createTestEvent({ user: { id: 'u-1' } })
      const labels = toLokiLabels(event, { labelFields: ['service', 'user'] })
      expect(labels.user).toBeUndefined()
      expect(labels.service).toBe('api')
    })

    it('stringifies numeric and boolean label values', () => {
      const event = createTestEvent({ status: 200, cached: true })
      const labels = toLokiLabels(event, { labelFields: ['status', 'cached'] })
      expect(labels).toEqual({ status: '200', cached: 'true' })
    })
  })

  describe('buildLokiPayload', () => {
    it('carries the full event as a JSON log line', () => {
      const event = createTestEvent({ path: '/api/users', status: 200 })
      const { streams } = buildLokiPayload([event], {})
      expect(streams).toHaveLength(1)
      expect(JSON.parse(streams[0].values[0][1])).toEqual(event)
    })

    it('groups events sharing a label set into one stream', () => {
      const events = [
        createTestEvent({ path: '/a' }),
        createTestEvent({ path: '/b' }),
      ]
      const { streams } = buildLokiPayload(events, {})
      expect(streams).toHaveLength(1)
      expect(streams[0].values).toHaveLength(2)
    })

    it('splits events into separate streams per label set', () => {
      const events = [
        createTestEvent({ level: 'info' }),
        createTestEvent({ level: 'error' }),
      ]
      const { streams } = buildLokiPayload(events, {})
      expect(streams).toHaveLength(2)
      expect(streams.map(s => s.stream.level).sort()).toEqual(['error', 'info'])
    })

    it('sorts entries by timestamp — Loki rejects out-of-order pushes', () => {
      const events = [
        createTestEvent({ timestamp: '2024-01-01T12:00:02.000Z' }),
        createTestEvent({ timestamp: '2024-01-01T12:00:01.000Z' }),
      ]
      const { streams } = buildLokiPayload(events, {})
      const [first, second] = streams[0].values
      expect(Number(first[0])).toBeLessThan(Number(second[0]))
    })
  })

  describe('authentication', () => {
    it('uses Basic auth when user and apiKey are both set (Grafana Cloud)', async () => {
      await sendToLoki(createTestEvent(), { endpoint: ENDPOINT, user: '123456', apiKey: 'glc_token' })
      expect(getFetchHeaders(fetchSpy).Authorization).toBe(`Basic ${btoa('123456:glc_token')}`)
    })

    it('encodes non-ASCII credentials as UTF-8 rather than throwing', async () => {
      // `btoa` alone throws above U+00FF; the adapter UTF-8 encodes first.
      await sendToLoki(createTestEvent(), { endpoint: ENDPOINT, user: 'té', apiKey: 'pässwörd' })
      const auth = getFetchHeaders(fetchSpy).Authorization
      const decoded = new TextDecoder().decode(
        Uint8Array.from(atob(auth.replace('Basic ', '')), c => c.charCodeAt(0)),
      )
      expect(decoded).toBe('té:pässwörd')
    })

    it('uses Bearer auth when only apiKey is set', async () => {
      await sendToLoki(createTestEvent(), { endpoint: ENDPOINT, apiKey: 'token' })
      expect(getFetchHeaders(fetchSpy).Authorization).toBe('Bearer token')
    })

    it('sends no Authorization header for an unauthenticated instance', async () => {
      await sendToLoki(createTestEvent(), { endpoint: ENDPOINT })
      expect(getFetchHeaders(fetchSpy).Authorization).toBeUndefined()
    })

    it('sends X-Scope-OrgID for a multi-tenant instance', async () => {
      await sendToLoki(createTestEvent(), { endpoint: ENDPOINT, tenantId: 'team-a' })
      expect(getFetchHeaders(fetchSpy)['X-Scope-OrgID']).toBe('team-a')
    })
  })

  describe('sendBatchToLoki', () => {
    it('pushes a batch in a single request', async () => {
      await sendBatchToLoki([createTestEvent(), createTestEvent()], { endpoint: ENDPOINT })
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(getFetchJson(fetchSpy).streams[0].values).toHaveLength(2)
    })

    it('is a no-op for an empty batch', async () => {
      await sendBatchToLoki([], { endpoint: ENDPOINT })
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('throws a labelled error on a non-OK response', async () => {
      fetchSpy.mockResolvedValue(new Response('bad', { status: 400, statusText: 'Bad Request' }))
      await expect(sendBatchToLoki([createTestEvent()], { endpoint: ENDPOINT, retries: 0 }))
        .rejects.toThrow('Loki API error: 400 Bad Request')
    })
  })

  describe('createLokiDrain', () => {
    it('resolves the endpoint from env', async () => {
      process.env.LOKI_ENDPOINT = ENDPOINT
      await createLokiDrain()({ event: createTestEvent() })
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(getFetchCall(fetchSpy).url).toBe('http://localhost:3100/loki/api/v1/push')
    })

    it('resolves Grafana Cloud credentials from env', async () => {
      process.env.LOKI_ENDPOINT = ENDPOINT
      process.env.LOKI_USER = '42'
      process.env.LOKI_API_KEY = 'glc_env'
      await createLokiDrain()({ event: createTestEvent() })
      expect(getFetchHeaders(fetchSpy).Authorization).toBe(`Basic ${btoa('42:glc_env')}`)
    })

    it('skips draining and reports when the endpoint is missing', async () => {
      await createLokiDrain()({ event: createTestEvent() })
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[evlog/loki] Missing endpoint'))
    })

    it('accepts a batch of drain contexts', async () => {
      await createLokiDrain({ endpoint: ENDPOINT })([
        { event: createTestEvent({ path: '/a' }) },
        { event: createTestEvent({ path: '/b' }) },
      ])
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(getFetchJson(fetchSpy).streams[0].values).toHaveLength(2)
    })

    it('never throws when the push fails', async () => {
      fetchSpy.mockResolvedValue(new Response('nope', { status: 500, statusText: 'Server Error' }))
      await expect(createLokiDrain({ endpoint: ENDPOINT, retries: 0 })({ event: createTestEvent() }))
        .resolves.toBeUndefined()
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('[evlog/loki] Failed to send events:'),
        expect.anything(),
      )
    })
  })
})
