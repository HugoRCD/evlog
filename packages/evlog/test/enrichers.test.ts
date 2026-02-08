import { describe, expect, it } from 'vitest'
import type { EnrichContext, WideEvent } from '../src/types'
import { createGeoEnricher, createRequestSizeEnricher, createTraceContextEnricher, createUserAgentEnricher } from '../src/enrichers'

function createContext(headers: Record<string, string>, responseHeaders?: Record<string, string>): EnrichContext {
  const event: WideEvent = {
    timestamp: new Date().toISOString(),
    level: 'info',
    service: 'test',
    environment: 'test',
  }

  return {
    event,
    headers,
    response: responseHeaders ? { headers: responseHeaders, status: 200 } : undefined,
  }
}

describe('enrichers', () => {
  it('adds user agent info', () => {
    const ctx = createContext({
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    })

    createUserAgentEnricher()(ctx)

    expect(ctx.event.userAgent).toBeDefined()
    expect((ctx.event.userAgent as { browser?: { name: string } }).browser?.name).toBe('Safari')
  })

  it('adds geo info from cloud headers', () => {
    const ctx = createContext({
      'cf-ipcountry': 'FR',
      'cf-region': 'Île-de-France',
      'cf-region-code': 'IDF',
      'cf-city': 'Paris',
    })

    createGeoEnricher()(ctx)

    expect(ctx.event.geo).toMatchObject({
      country: 'FR',
      region: 'Île-de-France',
      regionCode: 'IDF',
      city: 'Paris',
    })
  })

  it('adds request/response size info', () => {
    const ctx = createContext(
      { 'content-length': '512' },
      { 'content-length': '1024' },
    )

    createRequestSizeEnricher()(ctx)

    expect(ctx.event.requestSize).toMatchObject({
      requestBytes: 512,
      responseBytes: 1024,
    })
  })

  it('adds trace context data', () => {
    const ctx = createContext({
      traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      tracestate: 'congo=t61rcWkgMzE',
    })

    createTraceContextEnricher()(ctx)

    expect(ctx.event.traceId).toBe('0af7651916cd43dd8448eb211c80319c')
    expect(ctx.event.spanId).toBe('b7ad6b7169203331')
    expect(ctx.event.traceContext).toMatchObject({
      traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      tracestate: 'congo=t61rcWkgMzE',
    })
  })
})
