import type { DrainContext, WideEvent } from '../types'
import { getRuntimeConfig } from './_utils'

export interface BetterStackConfig {
  /** Better Stack source token */
  sourceToken: string
  /** Logtail ingestion endpoint. Default: https://in.logs.betterstack.com */
  endpoint?: string
  /** Request timeout in milliseconds. Default: 5000 */
  timeout?: number
}

/**
 * Transform an evlog wide event into a Better Stack event.
 * Maps `timestamp` to `dt` (Better Stack's expected field).
 */
export function toBetterStackEvent(event: WideEvent): Record<string, unknown> {
  const { timestamp, ...rest } = event
  return { dt: timestamp, ...rest }
}

/**
 * Create a drain function for sending logs to Better Stack.
 *
 * Configuration priority (highest to lowest):
 * 1. Overrides passed to createBetterStackDrain()
 * 2. runtimeConfig.evlog.betterStack
 * 3. runtimeConfig.betterStack
 * 4. Environment variables: NUXT_BETTER_STACK_*, BETTER_STACK_*
 *
 * @example
 * ```ts
 * // Zero config - just set NUXT_BETTER_STACK_SOURCE_TOKEN env var
 * nitroApp.hooks.hook('evlog:drain', createBetterStackDrain())
 *
 * // With overrides
 * nitroApp.hooks.hook('evlog:drain', createBetterStackDrain({
 *   sourceToken: 'my-token',
 * }))
 * ```
 */
export function createBetterStackDrain(overrides?: Partial<BetterStackConfig>): (ctx: DrainContext | DrainContext[]) => Promise<void> {
  return async (ctx: DrainContext | DrainContext[]) => {
    const contexts = Array.isArray(ctx) ? ctx : [ctx]
    if (contexts.length === 0) return

    const runtimeConfig = getRuntimeConfig() as Record<string, any> | undefined
    const evlogBetterStack = runtimeConfig?.evlog?.betterStack
    const rootBetterStack = runtimeConfig?.betterStack

    const config: Partial<BetterStackConfig> = {
      sourceToken: overrides?.sourceToken ?? evlogBetterStack?.sourceToken ?? rootBetterStack?.sourceToken ?? process.env.NUXT_BETTER_STACK_SOURCE_TOKEN ?? process.env.BETTER_STACK_SOURCE_TOKEN,
      endpoint: overrides?.endpoint ?? evlogBetterStack?.endpoint ?? rootBetterStack?.endpoint ?? process.env.NUXT_BETTER_STACK_ENDPOINT ?? process.env.BETTER_STACK_ENDPOINT,
      timeout: overrides?.timeout ?? evlogBetterStack?.timeout ?? rootBetterStack?.timeout,
    }

    if (!config.sourceToken) {
      console.error('[evlog/better-stack] Missing source token. Set NUXT_BETTER_STACK_SOURCE_TOKEN env var or pass to createBetterStackDrain()')
      return
    }

    try {
      await sendBatchToBetterStack(contexts.map(c => c.event), config as BetterStackConfig)
    } catch (error) {
      console.error('[evlog/better-stack] Failed to send events to Better Stack:', error)
    }
  }
}

/**
 * Send a single event to Better Stack.
 *
 * @example
 * ```ts
 * await sendToBetterStack(event, {
 *   sourceToken: process.env.BETTER_STACK_SOURCE_TOKEN!,
 * })
 * ```
 */
export async function sendToBetterStack(event: WideEvent, config: BetterStackConfig): Promise<void> {
  await sendBatchToBetterStack([event], config)
}

/**
 * Send a batch of events to Better Stack.
 *
 * @example
 * ```ts
 * await sendBatchToBetterStack(events, {
 *   sourceToken: process.env.BETTER_STACK_SOURCE_TOKEN!,
 * })
 * ```
 */
export async function sendBatchToBetterStack(events: WideEvent[], config: BetterStackConfig): Promise<void> {
  const endpoint = (config.endpoint ?? 'https://in.logs.betterstack.com').replace(/\/+$/, '')
  const timeout = config.timeout ?? 5000

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.sourceToken}`,
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(events.map(toBetterStackEvent)),
      signal: controller.signal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error')
      const safeText = text.length > 200 ? `${text.slice(0, 200)}...[truncated]` : text
      throw new Error(`Better Stack API error: ${response.status} ${response.statusText} - ${safeText}`)
    }
  } finally {
    clearTimeout(timeoutId)
  }
}
