import type { DrainContext, WideEvent } from '../types'
import { httpPost } from './http'

/**
 * Drain definition backed by an arbitrary `send` function. Use this for
 * non-HTTP transports (filesystem, in-memory queue, native SDK). For HTTP
 * backends, use `defineHttpDrain` instead.
 */
export interface DrainOptions<TConfig> {
  /** Stable identifier used in error logs. */
  name: string
  /** Return `null` to skip draining (e.g. missing API key in dev). */
  resolve: () => TConfig | null | Promise<TConfig | null>
  send: (events: WideEvent[], config: TConfig) => Promise<void>
}

/**
 * Build a drain callback. Errors raised by `send` are logged with the drain
 * name and swallowed, so a failing drain never breaks the request pipeline.
 *
 * @example
 * ```ts
 * export function createMyDrain(overrides?: Partial<MyConfig>) {
 *   return defineDrain<MyConfig>({
 *     name: 'my-drain',
 *     resolve: () => ({ url: process.env.MY_URL ?? null }),
 *     send: async (events, config) => { ... },
 *   })
 * }
 * ```
 */
export function defineDrain<TConfig>(options: DrainOptions<TConfig>): (ctx: DrainContext | DrainContext[]) => Promise<void> {
  return async (ctx: DrainContext | DrainContext[]) => {
    const contexts = Array.isArray(ctx) ? ctx : [ctx]
    if (contexts.length === 0) return

    const config = await options.resolve()
    if (!config) return

    try {
      await options.send(contexts.map(c => c.event), config)
    } catch (error) {
      console.error(`[evlog/${options.name}] Failed to send events:`, error)
    }
  }
}

export interface HttpDrainRequest {
  url: string
  /** Caller is responsible for `Content-Type`. */
  headers: Record<string, string>
  body: string
}

/** Adapters only need to ship config + `encode()` — no manual `fetch`. */
export interface HttpDrainOptions<TConfig> {
  /** Stable identifier used in error logs. */
  name: string
  /** Return `null` to skip draining (e.g. missing API key in dev). */
  resolve: () => TConfig | null | Promise<TConfig | null>
  /** Return `null` to skip the batch without raising. */
  encode: (events: WideEvent[], config: TConfig) => HttpDrainRequest | null
  /** @default 5000 */
  timeout?: number
  /** @default 2 */
  retries?: number
  /** Read the timeout off the resolved config (falls back to `timeout`). */
  resolveTimeout?: (config: TConfig) => number | undefined
  /** Read the retry count off the resolved config (falls back to `retries`). */
  resolveRetries?: (config: TConfig) => number | undefined
}

const DEFAULT_HTTP_TIMEOUT = 5000

/**
 * Build an HTTP drain. Timeouts/retries are resolved from the config (with
 * overrides via `resolveTimeout` / `resolveRetries`) and forwarded to
 * {@link httpPost}.
 *
 * @example
 * ```ts
 * export function createMyDrain(overrides?: Partial<MyConfig>) {
 *   return defineHttpDrain<MyConfig>({
 *     name: 'my',
 *     resolve: async () => {
 *       const cfg = await resolveAdapterConfig<MyConfig>('my', FIELDS, overrides)
 *       return cfg.apiKey ? cfg as MyConfig : null
 *     },
 *     encode: (events, config) => ({
 *       url: `${config.endpoint ?? 'https://api.my.com'}/ingest`,
 *       headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
 *       body: JSON.stringify(events),
 *     }),
 *   })
 * }
 * ```
 */
export function defineHttpDrain<TConfig>(options: HttpDrainOptions<TConfig>): (ctx: DrainContext | DrainContext[]) => Promise<void> {
  return defineDrain<TConfig>({
    name: options.name,
    resolve: options.resolve,
    send: async (events, config) => {
      if (events.length === 0) return
      const request = options.encode(events, config)
      if (!request) return
      const timeout = options.resolveTimeout?.(config)
        ?? (config as { timeout?: number }).timeout
        ?? options.timeout
        ?? DEFAULT_HTTP_TIMEOUT
      const retries = options.resolveRetries?.(config)
        ?? (config as { retries?: number }).retries
        ?? options.retries
      await httpPost({
        url: request.url,
        headers: request.headers,
        body: request.body,
        timeout,
        retries,
        label: options.name,
      })
    },
  })
}
