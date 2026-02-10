import type { DrainContext, WideEvent } from '../types'
import { getRuntimeConfig } from './_utils'

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

/**
 * Convert a WideEvent to a PostHog event format.
 */
export function toPostHogEvent(event: WideEvent, config: PostHogConfig): PostHogEvent {
  const { timestamp, level, service, ...rest } = event

  return {
    event: config.eventName ?? 'evlog_wide_event',
    distinct_id: config.distinctId ?? service,
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
export function createPostHogDrain(overrides?: Partial<PostHogConfig>): (ctx: DrainContext | DrainContext[]) => Promise<void> {
  return async (ctx: DrainContext | DrainContext[]) => {
    const contexts = Array.isArray(ctx) ? ctx : [ctx]
    if (contexts.length === 0) return

    const runtimeConfig = getRuntimeConfig()
    // Support both runtimeConfig.evlog.posthog and runtimeConfig.posthog
    const evlogPostHog = runtimeConfig?.evlog?.posthog
    const rootPostHog = runtimeConfig?.posthog

    // Build config with fallbacks: overrides > evlog.posthog > posthog > env vars (NUXT_POSTHOG_* or POSTHOG_*)
    const config: Partial<PostHogConfig> = {
      apiKey: overrides?.apiKey ?? evlogPostHog?.apiKey ?? rootPostHog?.apiKey ?? process.env.NUXT_POSTHOG_API_KEY ?? process.env.POSTHOG_API_KEY,
      host: overrides?.host ?? evlogPostHog?.host ?? rootPostHog?.host ?? process.env.NUXT_POSTHOG_HOST ?? process.env.POSTHOG_HOST,
      eventName: overrides?.eventName ?? evlogPostHog?.eventName ?? rootPostHog?.eventName,
      distinctId: overrides?.distinctId ?? evlogPostHog?.distinctId ?? rootPostHog?.distinctId,
      timeout: overrides?.timeout ?? evlogPostHog?.timeout ?? rootPostHog?.timeout,
    }

    if (!config.apiKey) {
      console.error('[evlog/posthog] Missing apiKey. Set NUXT_POSTHOG_API_KEY/POSTHOG_API_KEY env var or pass to createPostHogDrain()')
      return
    }

    try {
      await sendBatchToPostHog(contexts.map(c => c.event), config as PostHogConfig)
    } catch (error) {
      console.error('[evlog/posthog] Failed to send events to PostHog:', error)
    }
  }
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
  const timeout = config.timeout ?? 5000
  const url = `${host}/batch/`

  const batch = events.map(event => toPostHogEvent(event, config))

  const payload = {
    api_key: config.apiKey,
    batch,
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error')
      const safeText = text.length > 200 ? `${text.slice(0, 200)}...[truncated]` : text
      throw new Error(`PostHog API error: ${response.status} ${response.statusText} - ${safeText}`)
    }
  } finally {
    clearTimeout(timeoutId)
  }
}
