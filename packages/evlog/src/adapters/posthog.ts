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
  /** PostHog event name. Default: evlog_wide_event */
  eventName?: string
  /** Override distinct_id (defaults to event.service) */
  distinctId?: string
  /** Request timeout in milliseconds. Default: 5000 */
  timeout?: number
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
  { key: 'eventName' },
  { key: 'distinctId' },
  { key: 'timeout' },
]

/**
 * Convert a WideEvent to a PostHog event format.
 */
export function toPostHogEvent(event: WideEvent, config: PostHogConfig): PostHogEvent {
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

/**
 * Create a drain function for sending logs to PostHog.
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
 * Send a single event to PostHog.
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
 * Send a batch of events to PostHog.
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

  const host = (config.host ?? 'https://us.i.posthog.com').replace(/\/$/, '')
  const url = `${host}/batch/`

  const batch = events.map(event => toPostHogEvent(event, config))

  const payload = {
    api_key: config.apiKey,
    batch,
  }

  await httpPost({
    url,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeout: config.timeout ?? 5000,
    label: 'PostHog',
  })
}

export interface PostHogLogsConfig {
  /** PostHog project API key */
  apiKey: string
  /** PostHog host URL. Default: https://us.i.posthog.com */
  host?: string
  /** Request timeout in milliseconds. Default: 5000 */
  timeout?: number
}

const POSTHOG_LOGS_FIELDS: ConfigField<PostHogLogsConfig>[] = [
  { key: 'apiKey', env: ['NUXT_POSTHOG_API_KEY', 'POSTHOG_API_KEY'] },
  { key: 'host', env: ['NUXT_POSTHOG_HOST', 'POSTHOG_HOST'] },
  { key: 'timeout' },
]

/**
 * Create a drain function for sending logs to PostHog Logs via OTLP.
 *
 * PostHog Logs uses the standard OTLP log format. This drain wraps
 * `sendBatchToOTLP()` with PostHog-specific defaults (endpoint, auth).
 *
 * Configuration priority (highest to lowest):
 * 1. Overrides passed to createPostHogLogsDrain()
 * 2. runtimeConfig.evlog.posthog
 * 3. runtimeConfig.posthog
 * 4. Environment variables: NUXT_POSTHOG_*, POSTHOG_*
 *
 * @example
 * ```ts
 * // Zero config - just set NUXT_POSTHOG_API_KEY env var
 * nitroApp.hooks.hook('evlog:drain', createPostHogLogsDrain())
 *
 * // With overrides
 * nitroApp.hooks.hook('evlog:drain', createPostHogLogsDrain({
 *   apiKey: 'phc_...',
 *   host: 'https://eu.i.posthog.com',
 * }))
 * ```
 */
export function createPostHogLogsDrain(overrides?: Partial<PostHogLogsConfig>) {
  return defineDrain<PostHogLogsConfig>({
    name: 'posthog',
    resolve: () => {
      const config = resolveAdapterConfig<PostHogLogsConfig>('posthog', POSTHOG_LOGS_FIELDS, overrides)
      if (!config.apiKey) {
        console.error('[evlog/posthog] Missing apiKey. Set NUXT_POSTHOG_API_KEY/POSTHOG_API_KEY env var or pass to createPostHogLogsDrain()')
        return null
      }
      return config as PostHogLogsConfig
    },
    send: async (events, config) => {
      const host = (config.host ?? 'https://us.i.posthog.com').replace(/\/$/, '')
      const otlpConfig: OTLPConfig = {
        endpoint: `${host}/i`,
        headers: { Authorization: `Bearer ${config.apiKey}` },
        timeout: config.timeout,
      }
      await sendBatchToOTLP(events, otlpConfig)
    },
  })
}
