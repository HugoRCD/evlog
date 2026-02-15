import type { WideEvent } from '../types'
import type { ConfigField } from './_config'
import { resolveAdapterConfig } from './_config'
import { defineDrain } from './_drain'
import { httpPost } from './_http'

export interface BetterStackConfig {
  /** Better Stack source token */
  sourceToken: string
  /** Logtail ingestion endpoint. Default: https://in.logs.betterstack.com */
  endpoint?: string
  /** Request timeout in milliseconds. Default: 5000 */
  timeout?: number
}

const BETTER_STACK_FIELDS: ConfigField<BetterStackConfig>[] = [
  { key: 'sourceToken', env: ['NUXT_BETTER_STACK_SOURCE_TOKEN', 'BETTER_STACK_SOURCE_TOKEN'] },
  { key: 'endpoint', env: ['NUXT_BETTER_STACK_ENDPOINT', 'BETTER_STACK_ENDPOINT'] },
  { key: 'timeout' },
]

/**
 * Transform an evlog wide event into a Better Stack event.
 * Maps `timestamp` to `dt` (Better Stack's expected field).
 */
export function toBetterStackEvent(event: WideEvent): Record<string, unknown> {
  const { timestamp, ...rest } = event
  return { ...rest, dt: timestamp }
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
export function createBetterStackDrain(overrides?: Partial<BetterStackConfig>) {
  return defineDrain<BetterStackConfig>({
    name: 'better-stack',
    resolve: () => {
      const config = resolveAdapterConfig<BetterStackConfig>('betterStack', BETTER_STACK_FIELDS, overrides)
      if (!config.sourceToken) {
        console.error('[evlog/better-stack] Missing source token. Set NUXT_BETTER_STACK_SOURCE_TOKEN env var or pass to createBetterStackDrain()')
        return null
      }
      return config as BetterStackConfig
    },
    send: sendBatchToBetterStack,
  })
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

  await httpPost({
    url: endpoint,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.sourceToken}`,
    },
    body: JSON.stringify(events.map(toBetterStackEvent)),
    timeout: config.timeout ?? 5000,
    label: 'Better Stack',
  })
}
