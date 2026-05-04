import type { WideEvent } from '../types'
import type { ConfigField } from '../shared/config'
import { resolveAdapterConfig } from '../shared/config'
import { defineDrain, defineHttpDrain } from '../shared/drain'
import { httpPost } from '../shared/http'
import { sendBatchToOTLP } from './otlp'
import type { OTLPConfig } from './otlp'

/**
 * Mode for {@link createPostHogDrain}.
 *
 * - `'logs'` (default) — sends events to PostHog Logs via OTLP. Cheapest path
 *   and recommended for most teams.
 * - `'events'` — sends events to the `/batch/` API as custom PostHog events.
 *   Useful when you want events to appear in PostHog product analytics
 *   funnels/dashboards.
 */
export type PostHogMode = 'logs' | 'events'

export interface PostHogConfig {
  /** PostHog project API key */
  apiKey: string
  /** PostHog host URL. Default: https://us.i.posthog.com */
  host?: string
  /**
   * Send mode. `'logs'` (default) uses PostHog Logs (OTLP, cheapest);
   * `'events'` uses the `/batch/` API for custom PostHog events.
   * @default 'logs'
   */
  mode?: PostHogMode
  /**
   * PostHog event name when `mode === 'events'`. Ignored otherwise.
   * @default 'evlog_wide_event'
   */
  eventName?: string
  /**
   * Override `distinct_id` when `mode === 'events'`. Ignored otherwise.
   * Defaults to `event.userId` (when set) or `event.service`.
   */
  distinctId?: string
  /** Request timeout in milliseconds. Default: 5000 */
  timeout?: number
  /** Number of retry attempts on transient failures. Default: 2 */
  retries?: number
}

/**
 * @deprecated Use {@link PostHogConfig} with `mode: 'events'` instead.
 */
export type PostHogEventsConfig = PostHogConfig

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
  { key: 'mode' },
  { key: 'eventName' },
  { key: 'distinctId' },
  { key: 'timeout' },
  { key: 'retries' },
]

function resolveHost(config: PostHogConfig): string {
  return (config.host ?? 'https://us.i.posthog.com').replace(/\/$/, '')
}

function toOTLPConfig(config: PostHogConfig): OTLPConfig {
  return {
    endpoint: `${resolveHost(config)}/i`,
    headers: { Authorization: `Bearer ${config.apiKey}` },
    timeout: config.timeout,
    retries: config.retries,
  }
}

/**
 * Convert a WideEvent to a PostHog custom event.
 */
export function toPostHogEvent(event: WideEvent, config: PostHogConfig): PostHogEvent {
  const { timestamp, level, service, ...rest } = event
  return {
    event: config.eventName ?? 'evlog_wide_event',
    distinct_id: config.distinctId
      ?? (typeof event.userId === 'string' ? event.userId : undefined)
      ?? service,
    timestamp,
    properties: {
      level,
      service,
      ...rest,
    },
  }
}

/**
 * Create a drain function for sending logs to PostHog.
 *
 * - Default `mode: 'logs'` — sends events to PostHog Logs via OTLP. Recommended.
 * - `mode: 'events'` — sends events to the `/batch/` API as custom events.
 *
 * Configuration priority (highest to lowest):
 * 1. Overrides passed to createPostHogDrain()
 * 2. runtimeConfig.evlog.posthog
 * 3. runtimeConfig.posthog
 * 4. Environment variables: NUXT_POSTHOG_*, POSTHOG_*
 *
 * @example
 * ```ts
 * // Default: PostHog Logs (OTLP)
 * initLogger({ drain: createPostHogDrain() })
 *
 * // Custom events
 * initLogger({ drain: createPostHogDrain({ mode: 'events', eventName: 'server_request' }) })
 * ```
 */
export function createPostHogDrain(overrides?: Partial<PostHogConfig>) {
  const mode: PostHogMode = overrides?.mode ?? 'logs'

  if (mode === 'events') {
    return defineHttpDrain<PostHogConfig>({
      name: 'posthog-events',
      resolve: async () => {
        const config = await resolveAdapterConfig<PostHogConfig>('posthog', POSTHOG_FIELDS, overrides)
        if (!config.apiKey) {
          console.error('[evlog/posthog-events] Missing apiKey. Set NUXT_POSTHOG_API_KEY env var or pass to createPostHogDrain({ mode: \'events\' })')
          return null
        }
        return config as PostHogConfig
      },
      encode: (events, config) => ({
        url: `${resolveHost(config)}/batch/`,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: config.apiKey,
          batch: events.map(event => toPostHogEvent(event, config)),
        }),
      }),
    })
  }

  return defineDrain<PostHogConfig>({
    name: 'posthog',
    resolve: async () => {
      const config = await resolveAdapterConfig<PostHogConfig>('posthog', POSTHOG_FIELDS, overrides)
      if (!config.apiKey) {
        console.error('[evlog/posthog] Missing apiKey. Set NUXT_POSTHOG_API_KEY env var or pass to createPostHogDrain()')
        return null
      }
      return config as PostHogConfig
    },
    send: async (events, config) => {
      if (events.length === 0) return
      await sendBatchToOTLP(events, toOTLPConfig(config))
    },
  })
}

/**
 * @deprecated Use {@link createPostHogDrain} with `mode: 'events'`.
 */
export function createPostHogEventsDrain(overrides?: Partial<PostHogConfig>) {
  return createPostHogDrain({ ...overrides, mode: 'events' })
}

/**
 * Send a single event to PostHog Logs via OTLP.
 */
export async function sendToPostHog(event: WideEvent, config: PostHogConfig): Promise<void> {
  await sendBatchToPostHog([event], config)
}

/**
 * Send a batch of events to PostHog Logs via OTLP.
 */
export async function sendBatchToPostHog(events: WideEvent[], config: PostHogConfig): Promise<void> {
  if (events.length === 0) return
  await sendBatchToOTLP(events, toOTLPConfig(config))
}

/**
 * Send a single event to PostHog via the custom-events `/batch/` API.
 */
export async function sendToPostHogEvents(event: WideEvent, config: PostHogConfig): Promise<void> {
  await sendBatchToPostHogEvents([event], config)
}

/**
 * Send a batch of events to PostHog via the custom-events `/batch/` API.
 */
export async function sendBatchToPostHogEvents(events: WideEvent[], config: PostHogConfig): Promise<void> {
  if (events.length === 0) return
  await httpPost({
    url: `${resolveHost(config)}/batch/`,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: config.apiKey,
      batch: events.map(event => toPostHogEvent(event, config)),
    }),
    timeout: config.timeout ?? 5000,
    retries: config.retries,
    label: 'PostHog',
  })
}
