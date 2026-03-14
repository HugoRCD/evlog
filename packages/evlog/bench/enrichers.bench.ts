import { bench, describe } from 'vitest'
import type { EnrichContext } from '../src/types'
import {
  createGeoEnricher,
  createRequestSizeEnricher,
  createTraceContextEnricher,
  createUserAgentEnricher,
} from '../src/enrichers'

const chromeUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const firefoxUA = 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0'
const botUA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

function makeCtx(headers: Record<string, string>): EnrichContext {
  return {
    event: {} as Record<string, unknown>,
    headers,
    request: { method: 'GET', path: '/api/test', requestId: 'req_123' },
  }
}

describe('createUserAgentEnricher', () => {
  const enrich = createUserAgentEnricher()

  bench('Chrome desktop', () => {
    const ctx = makeCtx({ 'user-agent': chromeUA })
    enrich(ctx)
  })

  bench('Firefox Linux', () => {
    const ctx = makeCtx({ 'user-agent': firefoxUA })
    enrich(ctx)
  })

  bench('Googlebot', () => {
    const ctx = makeCtx({ 'user-agent': botUA })
    enrich(ctx)
  })

  bench('no user-agent header', () => {
    const ctx = makeCtx({})
    enrich(ctx)
  })
})

describe('createGeoEnricher', () => {
  const enrich = createGeoEnricher()

  bench('Vercel headers (full)', () => {
    const ctx = makeCtx({
      'x-vercel-ip-country': 'US',
      'x-vercel-ip-country-region': 'California',
      'x-vercel-ip-country-region-code': 'CA',
      'x-vercel-ip-city': 'San Francisco',
      'x-vercel-ip-latitude': '37.7749',
      'x-vercel-ip-longitude': '-122.4194',
    })
    enrich(ctx)
  })

  bench('Cloudflare headers (country only)', () => {
    const ctx = makeCtx({ 'cf-ipcountry': 'DE' })
    enrich(ctx)
  })

  bench('no geo headers', () => {
    const ctx = makeCtx({})
    enrich(ctx)
  })
})

describe('createRequestSizeEnricher', () => {
  const enrich = createRequestSizeEnricher()

  bench('with content-length', () => {
    const ctx = makeCtx({ 'content-length': '1024' })
    ctx.response = { headers: { 'content-length': '2048' } }
    enrich(ctx)
  })

  bench('no content-length', () => {
    const ctx = makeCtx({})
    enrich(ctx)
  })
})

describe('createTraceContextEnricher', () => {
  const enrich = createTraceContextEnricher()

  bench('with traceparent', () => {
    const ctx = makeCtx({
      'traceparent': '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
    })
    enrich(ctx)
  })

  bench('with traceparent + tracestate', () => {
    const ctx = makeCtx({
      'traceparent': '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      'tracestate': 'congo=t61rcWkgMzE',
    })
    enrich(ctx)
  })

  bench('no trace headers', () => {
    const ctx = makeCtx({})
    enrich(ctx)
  })
})

describe('full enricher pipeline', () => {
  const enrichers = [
    createUserAgentEnricher(),
    createGeoEnricher(),
    createRequestSizeEnricher(),
    createTraceContextEnricher(),
  ]

  const fullHeaders = {
    'user-agent': chromeUA,
    'x-vercel-ip-country': 'US',
    'x-vercel-ip-city': 'San Francisco',
    'x-vercel-ip-latitude': '37.7749',
    'x-vercel-ip-longitude': '-122.4194',
    'content-length': '1024',
    'traceparent': '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
  }

  bench('all enrichers (all headers present)', () => {
    const ctx: EnrichContext = {
      event: {} as Record<string, unknown>,
      headers: fullHeaders,
      request: { method: 'POST', path: '/api/checkout', requestId: 'req_123' },
      response: { headers: { 'content-length': '512' } },
    }
    for (const enricher of enrichers) enricher(ctx)
  })

  bench('all enrichers (no headers)', () => {
    const ctx: EnrichContext = {
      event: {} as Record<string, unknown>,
      headers: {},
      request: { method: 'GET', path: '/api/health', requestId: 'req_456' },
    }
    for (const enricher of enrichers) enricher(ctx)
  })
})
