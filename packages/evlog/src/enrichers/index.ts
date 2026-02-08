import type { EnrichContext } from '../types'

export interface EnricherOptions {
  /**
   * When true, overwrite any existing fields in the event.
   * Defaults to false to preserve user-provided data.
   */
  overwrite?: boolean
}

interface UserAgentInfo {
  raw: string
  browser?: { name: string; version?: string }
  os?: { name: string; version?: string }
  device?: { type: 'mobile' | 'tablet' | 'desktop' | 'bot' | 'unknown' }
}

interface GeoInfo {
  country?: string
  region?: string
  regionCode?: string
  city?: string
  latitude?: number
  longitude?: number
}

interface RequestSizeInfo {
  requestBytes?: number
  responseBytes?: number
}

interface TraceContextInfo {
  traceparent?: string
  tracestate?: string
  traceId?: string
  spanId?: string
}

function getHeader(headers: Record<string, string> | undefined, name: string): string | undefined {
  if (!headers) return undefined
  if (headers[name]) return headers[name]
  const lowerName = name.toLowerCase()
  if (headers[lowerName]) return headers[lowerName]
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) return value
  }
  return undefined
}

function parseUserAgent(ua: string): UserAgentInfo {
  const lower = ua.toLowerCase()

  let deviceType: UserAgentInfo['device'] = { type: 'unknown' }
  if (/bot|crawl|spider|slurp|bingpreview/.test(lower)) {
    deviceType = { type: 'bot' }
  } else if (/ipad|tablet/.test(lower)) {
    deviceType = { type: 'tablet' }
  } else if (/mobi|iphone|android/.test(lower)) {
    deviceType = { type: 'mobile' }
  } else if (ua.length > 0) {
    deviceType = { type: 'desktop' }
  }

  const browserMatchers: Array<{ name: string, regex: RegExp }> = [
    { name: 'Edge', regex: /edg\/([\d.]+)/i },
    { name: 'Chrome', regex: /chrome\/([\d.]+)/i },
    { name: 'Firefox', regex: /firefox\/([\d.]+)/i },
    { name: 'Safari', regex: /version\/([\d.]+).*safari/i },
  ]

  let browser: UserAgentInfo['browser']
  for (const matcher of browserMatchers) {
    const match = ua.match(matcher.regex)
    if (match) {
      browser = { name: matcher.name, version: match[1] }
      break
    }
  }

  let os: UserAgentInfo['os']
  if (/windows nt/i.test(ua)) {
    const match = ua.match(/windows nt ([\d.]+)/i)
    os = { name: 'Windows', version: match?.[1] }
  } else if (/mac os x/i.test(ua) && !/iphone|ipad|ipod/i.test(ua)) {
    const match = ua.match(/mac os x ([\d_]+)/i)
    os = { name: 'macOS', version: match?.[1]?.replace(/_/g, '.') }
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    const match = ua.match(/os ([\d_]+)/i)
    os = { name: 'iOS', version: match?.[1]?.replace(/_/g, '.') }
  } else if (/android/i.test(ua)) {
    const match = ua.match(/android ([\d.]+)/i)
    os = { name: 'Android', version: match?.[1] }
  } else if (/linux/i.test(ua)) {
    os = { name: 'Linux' }
  }

  return {
    raw: ua,
    browser,
    os,
    device: deviceType,
  }
}

function parseTraceparent(traceparent: string): Pick<TraceContextInfo, 'traceId' | 'spanId'> | undefined {
  const match = traceparent.match(/^[\da-f]{2}-([\da-f]{32})-([\da-f]{16})-[\da-f]{2}$/i)
  if (!match) return undefined
  return { traceId: match[1], spanId: match[2] }
}

function mergeEventField<T extends Record<string, unknown>>(
  existing: unknown,
  computed: T,
  overwrite?: boolean,
): T {
  if (overwrite || existing === undefined || existing === null || typeof existing !== 'object') {
    return computed
  }
  return { ...computed, ...(existing as T) }
}

function normalizeNumber(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Enrich events with parsed user agent data.
 */
export function createUserAgentEnricher(options: EnricherOptions = {}): (ctx: EnrichContext) => void {
  return (ctx) => {
    const ua = getHeader(ctx.headers, 'user-agent')
    if (!ua) return
    const info = parseUserAgent(ua)
    ctx.event.userAgent = mergeEventField<UserAgentInfo>(ctx.event.userAgent, info, options.overwrite)
  }
}

/**
 * Enrich events with geo data from Cloudflare/Vercel headers.
 */
export function createGeoEnricher(options: EnricherOptions = {}): (ctx: EnrichContext) => void {
  return (ctx) => {
    const { headers } = ctx
    if (!headers) return

    const geo: GeoInfo = {
      country: getHeader(headers, 'cf-ipcountry') ?? getHeader(headers, 'x-vercel-ip-country'),
      region: getHeader(headers, 'cf-region') ?? getHeader(headers, 'x-vercel-ip-country-region'),
      regionCode: getHeader(headers, 'cf-region-code') ?? getHeader(headers, 'x-vercel-ip-country-region-code'),
      city: getHeader(headers, 'cf-city') ?? getHeader(headers, 'x-vercel-ip-city'),
      latitude: normalizeNumber(getHeader(headers, 'cf-latitude') ?? getHeader(headers, 'x-vercel-ip-latitude')),
      longitude: normalizeNumber(getHeader(headers, 'cf-longitude') ?? getHeader(headers, 'x-vercel-ip-longitude')),
    }

    if (Object.values(geo).every(value => value === undefined)) return
    ctx.event.geo = mergeEventField<GeoInfo>(ctx.event.geo, geo, options.overwrite)
  }
}

/**
 * Enrich events with request/response payload sizes.
 */
export function createRequestSizeEnricher(options: EnricherOptions = {}): (ctx: EnrichContext) => void {
  return (ctx) => {
    const requestBytes = normalizeNumber(getHeader(ctx.headers, 'content-length'))
    const responseBytes = normalizeNumber(getHeader(ctx.response?.headers, 'content-length'))

    const sizes: RequestSizeInfo = {
      requestBytes,
      responseBytes,
    }

    if (requestBytes === undefined && responseBytes === undefined) return
    ctx.event.requestSize = mergeEventField<RequestSizeInfo>(ctx.event.requestSize, sizes, options.overwrite)
  }
}

/**
 * Enrich events with W3C trace context data.
 */
export function createTraceContextEnricher(options: EnricherOptions = {}): (ctx: EnrichContext) => void {
  return (ctx) => {
    const traceparent = getHeader(ctx.headers, 'traceparent')
    const tracestate = getHeader(ctx.headers, 'tracestate')
    if (!traceparent && !tracestate) return

    const parsed = traceparent ? parseTraceparent(traceparent) : undefined
    const traceContext: TraceContextInfo = {
      traceparent,
      tracestate,
      traceId: parsed?.traceId ?? (ctx.event.traceId as string | undefined),
      spanId: parsed?.spanId ?? (ctx.event.spanId as string | undefined),
    }

    if (traceContext.traceId && (options.overwrite || ctx.event.traceId === undefined)) {
      ctx.event.traceId = traceContext.traceId
    }
    if (traceContext.spanId && (options.overwrite || ctx.event.spanId === undefined)) {
      ctx.event.spanId = traceContext.spanId
    }

    ctx.event.traceContext = mergeEventField<TraceContextInfo>(ctx.event.traceContext, traceContext, options.overwrite)
  }
}
