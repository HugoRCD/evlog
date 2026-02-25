import type { WideEvent } from '../types'
import type { ConfigField } from './_config'
import { resolveAdapterConfig } from './_config'
import { defineDrain } from './_drain'
import { httpPost } from './_http'
import { sendBatchToOTLP } from './otlp'
import type { OTLPConfig } from './otlp'

export interface PostHogConfig {
  /** PostHog project API key */
  apiKey: string
  /** PostHog host URL. Default: https://us.i.posthog.com */
  host?: string
  /** Request timeout in milliseconds. Default: 5000 */
  timeout?: number
}

export interface PostHogEventsConfig extends PostHogConfig {
  /** PostHog event name. Default: evlog_wide_event */
  eventName?: string
  /** Override distinct_id (defaults to event.service) */
  distinctId?: string
}

/** PostHog event structure for the batch API */
export interface PostHogEvent {
  event: string
  distinct_id: string
  timestamp: string
  properties: Record<string, unknown>
}

const POSTHOG_FIELDS: ConfigField<PostHogConfig>[] = [
  { key: 'apiKey', env: ['NUXT_POSTHOG_API_KEY', 'POSTHOG_API_KEY'] },
  { key: 'host', env: ['NUXT_POSTHOG_HOST', 'POSTHOG_HOST'] },
  { key: 'timeout' },
]

const POSTHOG_EVENTS_FIELDS: ConfigField<PostHogEventsConfig>[] = [
  ...POSTHOG_FIELDS,
  { key: 'eventName' },
  { key: 'distinctId' },
]

function resolveHost(config: PostHogConfig): string {
  return (config.host ?? 'https://us.i.posthog.com').replace(/\/$/, '')
}

function toOTLPConfig(config: PostHogConfig): OTLPConfig {
  const host = resolveHost(config)
  return {
    endpoint: `${host}/i`,
    headers: { Authorization: `Bearer ${config.apiKey}` },
    timeout: config.timeout,
  }
}

/**
 * Convert a WideEvent to a PostHog custom event format.
 */
export function toPostHogEvent(event: WideEvent, config: PostHogEventsConfig): PostHogEvent {
  const { timestamp, level, service, ...rest } = event

  return {
    event: config.eventName ?? 'evlog_wide_event',
    distinct_id: config.distinctId ?? (typeof event.userId === 'string' ? event.userId : undefined) ?? service,
    timestamp,
    properties: {
      level,
      service,
      ...rest,
    },
  }
}

// ---------------------------------------------------------------------------
// PostHog Logs (OTLP) — default
// ---------------------------------------------------------------------------

/**
 * Create a drain function for sending logs to PostHog Logs via OTLP.
 *
 * Configuration priority (highest to lowest):
 * 1. Overrides passed to createPostHogDrain()
 * 2. runtimeConfig.evlog.posthog
 * 3. runtimeConfig.posthog
 * 4. Environment variables: NUXT_POSTHOG_*, POSTHOG_*
 *
 * @example
 * ```ts
 * // Zero config - just set NUXT_POSTHOG_API_KEY env var
 * nitroApp.hooks.hook('evlog:drain', createPostHogDrain())
 *
 * // With overrides
 * nitroApp.hooks.hook('evlog:drain', createPostHogDrain({
 *   apiKey: 'phc_...',
 *   host: 'https://eu.i.posthog.com',
 * }))
 * ```
 */
export function createPostHogDrain(overrides?: Partial<PostHogConfig>) {
  return defineDrain<PostHogConfig>({
    name: 'posthog',
    resolve: () => {
      const config = resolveAdapterConfig<PostHogConfig>('posthog', POSTHOG_FIELDS, overrides)
      if (!config.apiKey) {
        console.error('[evlog/posthog] Missing apiKey. Set NUXT_POSTHOG_API_KEY/POSTHOG_API_KEY env var or pass to createPostHogDrain()')
        return null
      }
      return config as PostHogConfig
    },
    send: sendBatchToPostHog,
  })
}

/**
 * Send a single event to PostHog Logs via OTLP.
 *
 * @example
 * ```ts
 * await sendToPostHog(event, {
 *   apiKey: process.env.POSTHOG_API_KEY!,
 * })
 * ```
 */
export async function sendToPostHog(event: WideEvent, config: PostHogConfig): Promise<void> {
  await sendBatchToPostHog([event], config)
}

/**
 * Send a batch of events to PostHog Logs via OTLP.
 *
 * @example
 * ```ts
 * await sendBatchToPostHog(events, {
 *   apiKey: process.env.POSTHOG_API_KEY!,
 * })
 * ```
 */
export async function sendBatchToPostHog(events: WideEvent[], config: PostHogConfig): Promise<void> {
  if (events.length === 0) return
  await sendBatchToOTLP(events, toOTLPConfig(config))
}

// ---------------------------------------------------------------------------
// PostHog Events (custom events via /batch/)
// ---------------------------------------------------------------------------

/**
 * Create a drain function for sending logs to PostHog as custom events.
 *
 * Uses PostHog's `/batch/` API. Consider using `createPostHogDrain()` instead
 * which uses PostHog Logs (OTLP) and is significantly cheaper.
 *
 * Configuration priority (highest to lowest):
 * 1. Overrides passed to createPostHogEventsDrain()
 * 2. runtimeConfig.evlog.posthog
 * 3. runtimeConfig.posthog
 * 4. Environment variables: NUXT_POSTHOG_*, POSTHOG_*
 *
 * @example
 * ```ts
 * nitroApp.hooks.hook('evlog:drain', createPostHogEventsDrain({
 *   eventName: 'server_request',
 * }))
 * ```
 */
export function createPostHogEventsDrain(overrides?: Partial<PostHogEventsConfig>) {
  return defineDrain<PostHogEventsConfig>({
    name: 'posthog-events',
    resolve: () => {
      const config = resolveAdapterConfig<PostHogEventsConfig>('posthog', POSTHOG_EVENTS_FIELDS, overrides)
      if (!config.apiKey) {
        console.error('[evlog/posthog-events] Missing apiKey. Set NUXT_POSTHOG_API_KEY/POSTHOG_API_KEY env var or pass to createPostHogEventsDrain()')
        return null
      }
      return config as PostHogEventsConfig
    },
    send: sendBatchToPostHogEvents,
  })
}

/**
 * Send a single event to PostHog as a custom event.
 *
 * @example
 * ```ts
 * await sendToPostHogEvents(event, {
 *   apiKey: process.env.POSTHOG_API_KEY!,
 * })
 * ```
 */
export async function sendToPostHogEvents(event: WideEvent, config: PostHogEventsConfig): Promise<void> {
  await sendBatchToPostHogEvents([event], config)
}

/**
 * Send a batch of events to PostHog as custom events via the `/batch/` API.
 *
 * @example
 * ```ts
 * await sendBatchToPostHogEvents(events, {
 *   apiKey: process.env.POSTHOG_API_KEY!,
 * })
 * ```
 */
export async function sendBatchToPostHogEvents(events: WideEvent[], config: PostHogEventsConfig): Promise<void> {
  if (events.length === 0) return

  const url = `${resolveHost(config)}/batch/`
  const batch = events.map(event => toPostHogEvent(event, config))

  await httpPost({
    url,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: config.apiKey, batch }),
    timeout: config.timeout ?? 5000,
    label: 'PostHog',
  })
}
