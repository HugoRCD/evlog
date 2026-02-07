import type { DrainContext, WideEvent } from '../types'

export interface SentryConfig {
  /** Sentry DSN */
  dsn: string
  /** Environment override (defaults to event.environment) */
  environment?: string
  /** Release version override (defaults to event.version) */
  release?: string
  /** Server name override */
  serverName?: string
  /** Logger name override. Default: evlog */
  logger?: string
  /** Message override (defaults to event.message/action/path) */
  message?: string
  /** Additional tags to attach */
  tags?: Record<string, string>
  /** Request timeout in milliseconds. Default: 5000 */
  timeout?: number
}

export interface SentryEvent {
  event_id: string
  timestamp: string
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug'
  platform: 'javascript'
  logger?: string
  environment?: string
  release?: string
  server_name?: string
  message?: string
  tags?: Record<string, string>
  extra?: Record<string, unknown>
}

interface SentryDsnParts {
  publicKey: string
  projectId: string
  origin: string
  basePath: string
}

/**
 * Try to get runtime config from Nitro/Nuxt environment.
 * Returns undefined if not in a Nitro context.
 */
function getRuntimeConfig(): { evlog?: { sentry?: Partial<SentryConfig> }, sentry?: Partial<SentryConfig> } | undefined {
  try {
    // Dynamic import to avoid bundling issues when not in Nitro
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useRuntimeConfig } = require('nitropack/runtime')
    return useRuntimeConfig()
  } catch {
    return undefined
  }
}

function parseSentryDsn(dsn: string): SentryDsnParts {
  const url = new URL(dsn)
  const publicKey = url.username
  if (!publicKey) {
    throw new Error('Invalid Sentry DSN: missing public key')
  }

  const pathParts = url.pathname.split('/').filter(Boolean)
  const projectId = pathParts.pop()
  if (!projectId) {
    throw new Error('Invalid Sentry DSN: missing project ID')
  }

  const basePath = pathParts.length > 0 ? `/${pathParts.join('/')}` : ''

  return {
    publicKey,
    projectId,
    origin: `${url.protocol}//${url.host}`,
    basePath,
  }
}

function getSentryStoreUrl(dsn: string): { url: string, authHeader: string } {
  const { publicKey, projectId, origin, basePath } = parseSentryDsn(dsn)
  const url = `${origin}${basePath}/api/${projectId}/store/`
  const authHeader = `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=evlog`
  return { url, authHeader }
}

function createEventId(): string {
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

/**
 * Convert a WideEvent to a Sentry event payload.
 */
export function toSentryEvent(event: WideEvent, config: SentryConfig): SentryEvent {
  const { timestamp, level, service, environment, ...rest } = event
  const levelMap: Record<WideEvent['level'], SentryEvent['level']> = {
    info: 'info',
    warn: 'warning',
    error: 'error',
    debug: 'debug',
  }

  const message = config.message
    ?? getFirstStringValue(event, ['message', 'action', 'path'])
    ?? 'evlog wide event'

  const extra = { ...rest }
  if (typeof extra.message === 'string') {
    delete extra.message
  }

  const tags = {
    service,
    ...config.tags,
  }

  return {
    event_id: createEventId(),
    timestamp,
    level: levelMap[level] ?? 'info',
    platform: 'javascript',
    logger: config.logger ?? 'evlog',
    environment: config.environment ?? environment,
    release: config.release ?? event.version,
    server_name: config.serverName,
    message,
    tags,
    extra,
  }
}

/**
 * Create a drain function for sending logs to Sentry.
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
      serverName: overrides?.serverName ?? evlogSentry?.serverName ?? rootSentry?.serverName ?? process.env.NUXT_SENTRY_SERVER_NAME ?? process.env.SENTRY_SERVER_NAME,
      logger: overrides?.logger ?? evlogSentry?.logger ?? rootSentry?.logger,
      message: overrides?.message ?? evlogSentry?.message ?? rootSentry?.message,
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
      console.error('[evlog/sentry] Failed to send event:', error)
    }
  }
}

/**
 * Send a single event to Sentry.
 *
 * @example
 * ```ts
 * await sendToSentry(event, {
 *   dsn: process.env.SENTRY_DSN!,
 * })
 * ```
 */
export async function sendToSentry(event: WideEvent, config: SentryConfig): Promise<void> {
  const { url, authHeader } = getSentryStoreUrl(config.dsn)
  const timeout = config.timeout ?? 5000
  const payload = toSentryEvent(event, config)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': authHeader,
      },
      body: JSON.stringify(payload),
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

/**
 * Send a batch of events to Sentry.
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

  for (const event of events) {
    // Sentry's store endpoint accepts one event at a time.
    await sendToSentry(event, config)
  }
}
