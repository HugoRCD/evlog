import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendBatchToAxiom } from '../src/adapters/axiom'
import { sendBatchToDatadog } from '../src/adapters/datadog'
import { sendBatchToOTLP } from '../src/adapters/otlp'
import { EVLOG_USER_AGENT, EVLOG_VERSION, httpPost, withEvlogIdentityHeaders } from '../src/shared/http'
import type { WideEvent } from '../src/types'

const event: WideEvent = {
  timestamp: '2024-01-01T12:00:00.000Z',
  level: 'info',
  service: 'test-service',
  environment: 'test',
}

describe('shared/http evlog identity', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('EVLOG_VERSION / EVLOG_USER_AGENT', () => {
    it('exposes a non-empty version string matching SemVer', () => {
      expect(EVLOG_VERSION).toMatch(/^\d+\.\d+\.\d+/)
    })

    it('uses `evlog/<version>` as default User-Agent', () => {
      expect(EVLOG_USER_AGENT).toBe(`evlog/${EVLOG_VERSION}`)
    })
  })

  describe('withEvlogIdentityHeaders', () => {
    it('injects User-Agent when missing', () => {
      const out = withEvlogIdentityHeaders({ 'Content-Type': 'application/json' })
      expect(out['User-Agent']).toBe(EVLOG_USER_AGENT)
    })

    it('preserves caller User-Agent (case-insensitive match)', () => {
      const out = withEvlogIdentityHeaders({ 'user-agent': 'my-app/1.0' })
      expect(out['User-Agent']).toBeUndefined()
      expect(out['user-agent']).toBe('my-app/1.0')
    })

    it('respects userAgent override', () => {
      const out = withEvlogIdentityHeaders({}, { userAgent: 'custom-ua/2.0' })
      expect(out['User-Agent']).toBe('custom-ua/2.0')
    })

    it('suppresses User-Agent when userAgent is false', () => {
      const out = withEvlogIdentityHeaders({}, { userAgent: false })
      expect(out['User-Agent']).toBeUndefined()
    })

    it('adds X-Evlog-Source when source is provided', () => {
      const out = withEvlogIdentityHeaders({}, { source: 'axiom' })
      expect(out['X-Evlog-Source']).toBe('axiom')
    })

    it('does not overwrite caller-provided X-Evlog-Source', () => {
      const out = withEvlogIdentityHeaders({ 'X-Evlog-Source': 'app' }, { source: 'axiom' })
      expect(out['X-Evlog-Source']).toBe('app')
    })

    it('does not add X-Evlog-Source when source is omitted', () => {
      const out = withEvlogIdentityHeaders({})
      expect(out['X-Evlog-Source']).toBeUndefined()
    })
  })

  describe('httpPost identity injection', () => {
    it('injects User-Agent header into fetch call', async () => {
      await httpPost({
        url: 'https://example.com/ingest',
        headers: { 'Content-Type': 'application/json' },
        body: '[]',
        timeout: 5000,
        label: 'test',
        source: 'test',
      })

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const headers = options.headers as Record<string, string>
      expect(headers['User-Agent']).toBe(EVLOG_USER_AGENT)
      expect(headers['X-Evlog-Source']).toBe('test')
    })
  })
})

describe('drain adapters identity headers', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('axiom sends User-Agent + X-Evlog-Source headers', async () => {
    await sendBatchToAxiom([event], { dataset: 'd', apiKey: 'k' })
    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const headers = options.headers as Record<string, string>
    expect(headers['User-Agent']).toBe(EVLOG_USER_AGENT)
    expect(headers['X-Evlog-Source']).toBe('axiom')
  })

  it('datadog sends User-Agent + X-Evlog-Source headers', async () => {
    await sendBatchToDatadog([event], { apiKey: 'k' })
    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const headers = options.headers as Record<string, string>
    expect(headers['User-Agent']).toBe(EVLOG_USER_AGENT)
    expect(headers['X-Evlog-Source']).toBe('datadog')
  })

  it('otlp sends User-Agent + X-Evlog-Source headers', async () => {
    await sendBatchToOTLP([event], { endpoint: 'https://otel.example.com' })
    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const headers = options.headers as Record<string, string>
    expect(headers['User-Agent']).toBe(EVLOG_USER_AGENT)
    expect(headers['X-Evlog-Source']).toBe('otlp')
  })
})
