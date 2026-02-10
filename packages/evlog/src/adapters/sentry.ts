import type { DrainContext, LogLevel, WideEvent } from '../types'
import { getRuntimeConfig } from './_utils'

export interface SentryConfig {
  /** Sentry DSN */
  dsn: string
  /** Environment override (defaults to event.environment) */
  environment?: string
  /** Release version override (defaults to event.version) */
  release?: string
  /** Additional tags to attach as attributes */
  tags?: Record<string, string>
  /** Request timeout in milliseconds. Default: 5000 */
  timeout?: number
}

/** Sentry Log attribute value with type annotation */
export interface SentryAttributeValue {
  value: string | number | boolean
  type: 'string' | 'integer' | 'double' | 'boolean'
}

/** Sentry Structured Log payload */
export interface SentryLog {
  timestamp: number
  trace_id: string
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
  body: string
  severity_number: number
  attributes?: Record<string, SentryAttributeValue>
}

interface SentryDsnParts {
  publicKey: string
  secretKey?: string
  projectId: string
  origin: string
  basePath: string
}

/** Based on OpenTelemetry Logs Data Model specification */
const SEVERITY_MAP: Record<LogLevel, number> = {
  debug: 5,
  info: 9,
  warn: 13,
  error: 17,
}

function parseSentryDsn(dsn: string): SentryDsnParts {
  const url = new URL(dsn)
  const publicKey = url.username
  if (!publicKey) {
    throw new Error('Invalid Sentry DSN: missing public key')
  }

  const secretKey = url.password || undefined

  const pathParts = url.pathname.split('/').filter(Boolean)
  const projectId = pathParts.pop()
  if (!projectId) {
    throw new Error('Invalid Sentry DSN: missing project ID')
  }

  const basePath = pathParts.length > 0 ? `/${pathParts.join('/')}` : ''

  return {
    publicKey,
    secretKey,
    projectId,
    origin: `${url.protocol}//${url.host}`,
    basePath,
  }
}

function getSentryEnvelopeUrl(dsn: string): { url: string, authHeader: string } {
  const { publicKey, secretKey, projectId, origin, basePath } = parseSentryDsn(dsn)
  const url = `${origin}${basePath}/api/${projectId}/envelope/`
  let authHeader = `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=evlog`
  if (secretKey) {
    authHeader += `, sentry_secret=${secretKey}`
  }
  return { url, authHeader }
}

function createTraceId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID().replace(/-/g, '')
  }

  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

function getFirstStringValue(event: WideEvent, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = event[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

function toAttributeValue(value: unknown): SentryAttributeValue | undefined {
  if (value === null || value === undefined) {
    return undefined
  }
  if (typeof value === 'string') {
    return { value, type: 'string' }
  }
  if (typeof value === 'boolean') {
    return { value, type: 'boolean' }
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { value, type: 'integer' }
    }
    return { value, type: 'double' }
  }
  return { value: JSON.stringify(value), type: 'string' }
}

export function toSentryLog(event: WideEvent, config: SentryConfig): SentryLog {
  const { timestamp, level, service, environment, version, ...rest } = event

  const body = getFirstStringValue(event, ['message', 'action', 'path'])
    ?? 'evlog wide event'

  const traceId = (typeof event.traceId === 'string' && event.traceId.length > 0)
    ? event.traceId
    : createTraceId()

  const attributes: Record<string, SentryAttributeValue> = {}

  const env = config.environment ?? environment
  if (env) {
    attributes['sentry.environment'] = { value: env, type: 'string' }
  }

  const rel = config.release ?? version
  if (typeof rel === 'string' && rel.length > 0) {
    attributes['sentry.release'] = { value: rel, type: 'string' }
  }

  attributes['service'] = { value: service, type: 'string' }

  if (config.tags) {
    for (const [key, value] of Object.entries(config.tags)) {
      attributes[key] = { value, type: 'string' }
    }
  }

  for (const [key, value] of Object.entries(rest)) {
    if (key === 'traceId' || key === 'spanId') continue
    if (value === undefined || value === null) continue
    const attr = toAttributeValue(value)
    if (attr) {
      attributes[key] = attr
    }
  }

  return {
    timestamp: new Date(timestamp).getTime() / 1000,
    trace_id: traceId,
    level: level as SentryLog['level'],
    body,
    severity_number: SEVERITY_MAP[level] ?? 9,
    attributes,
  }
}

/**
 * Build the Sentry Envelope body for a list of logs.
 *
 * Envelope format (line-delimited):
 * - Line 1: Envelope headers (dsn, sent_at)
 * - Line 2: Item header (type: log, item_count, content_type)
 * - Line 3: Item payload ({"items": [...]})
 */
function buildEnvelopeBody(logs: SentryLog[], dsn: string): string {
  const envelopeHeader = JSON.stringify({
    dsn,
    sent_at: new Date().toISOString(),
  })

  const itemHeader = JSON.stringify({
    type: 'log',
    item_count: logs.length,
    content_type: 'application/vnd.sentry.items.log+json',
  })

  const itemPayload = JSON.stringify({ items: logs })

  return `${envelopeHeader}\n${itemHeader}\n${itemPayload}\n`
}

/**
 * Create a drain function for sending logs to Sentry.
 *
 * Sends wide events as Sentry Structured Logs, visible in Explore > Logs
 * in the Sentry dashboard.
 *
 * Configuration priority (highest to lowest):
 * 1. Overrides passed to createSentryDrain()
 * 2. runtimeConfig.evlog.sentry
 * 3. runtimeConfig.sentry
 * 4. Environment variables: NUXT_SENTRY_*, SENTRY_*
 *
 * @example
 * ```ts
 * // Zero config - just set NUXT_SENTRY_DSN env var
 * nitroApp.hooks.hook('evlog:drain', createSentryDrain())
 *
 * // With overrides
 * nitroApp.hooks.hook('evlog:drain', createSentryDrain({
 *   dsn: 'https://public@o0.ingest.sentry.io/123',
 * }))
 * ```
 */
export function createSentryDrain(overrides?: Partial<SentryConfig>): (ctx: DrainContext) => Promise<void> {
  return async (ctx: DrainContext) => {
    const runtimeConfig = getRuntimeConfig()
    const evlogSentry = runtimeConfig?.evlog?.sentry
    const rootSentry = runtimeConfig?.sentry

    const config: Partial<SentryConfig> = {
      dsn: overrides?.dsn ?? evlogSentry?.dsn ?? rootSentry?.dsn ?? process.env.NUXT_SENTRY_DSN ?? process.env.SENTRY_DSN,
      environment: overrides?.environment ?? evlogSentry?.environment ?? rootSentry?.environment ?? process.env.NUXT_SENTRY_ENVIRONMENT ?? process.env.SENTRY_ENVIRONMENT,
      release: overrides?.release ?? evlogSentry?.release ?? rootSentry?.release ?? process.env.NUXT_SENTRY_RELEASE ?? process.env.SENTRY_RELEASE,
      tags: overrides?.tags ?? evlogSentry?.tags ?? rootSentry?.tags,
      timeout: overrides?.timeout ?? evlogSentry?.timeout ?? rootSentry?.timeout,
    }

    if (!config.dsn) {
      console.error('[evlog/sentry] Missing DSN. Set NUXT_SENTRY_DSN/SENTRY_DSN env var or pass to createSentryDrain()')
      return
    }

    try {
      await sendToSentry(ctx.event, config as SentryConfig)
    } catch (error) {
      console.error('[evlog/sentry] Failed to send log:', error)
    }
  }
}

/**
 * Send a single event to Sentry as a structured log.
 *
 * @example
 * ```ts
 * await sendToSentry(event, {
 *   dsn: process.env.SENTRY_DSN!,
 * })
 * ```
 */
export async function sendToSentry(event: WideEvent, config: SentryConfig): Promise<void> {
  await sendBatchToSentry([event], config)
}

/**
 * Send a batch of events to Sentry as structured logs via the Envelope endpoint.
 *
 * @example
 * ```ts
 * await sendBatchToSentry(events, {
 *   dsn: process.env.SENTRY_DSN!,
 * })
 * ```
 */
export async function sendBatchToSentry(events: WideEvent[], config: SentryConfig): Promise<void> {
  if (events.length === 0) return

  const { url, authHeader } = getSentryEnvelopeUrl(config.dsn)
  const timeout = config.timeout ?? 5000

  const logs = events.map(event => toSentryLog(event, config))
  const body = buildEnvelopeBody(logs, config.dsn)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': authHeader,
      },
      body,
      signal: controller.signal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error')
      const safeText = text.length > 200 ? `${text.slice(0, 200)}...[truncated]` : text
      throw new Error(`Sentry API error: ${response.status} ${response.statusText} - ${safeText}`)
    }
  } finally {
    clearTimeout(timeoutId)
  }
}
