import type { DrainContext, WideEvent } from '../types'
import { httpPost } from './http'

/**
 * Definition of a drain backed by an arbitrary `send` function.
 *
 * @beta Part of `evlog/toolkit`. Use `defineDrain` for non-HTTP transports
 * (e.g. filesystem, in-memory queue, native SDK), and `defineHttpDrain` for
 * HTTP backends.
 */
export interface DrainOptions<TConfig> {
  /** Stable identifier used in error logs. */
  name: string
  /**
   * Resolve the runtime configuration. Return `null` to skip draining without
   * raising an error (e.g. missing API key in development).
   */
  resolve: () => TConfig | null | Promise<TConfig | null>
  /** Send a batch of events to the backend. */
  send: (events: WideEvent[], config: TConfig) => Promise<void>
}

/**
 * Build a drain callback for `evlog:drain` (or `initLogger({ drain })`).
 *
 * The returned function is async so `resolve` can load Nitro runtime config;
 * hosts typically attach the resulting promise to `waitUntil` so the HTTP
 * response is not blocked.
 *
 * @beta Part of `evlog/toolkit` — building block for all community adapters.
 *
 * @example
 * ```ts
 * import { defineDrain } from 'evlog/toolkit'
 *
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

/**
 * Encoded HTTP request returned from {@link HttpDrainOptions.encode}.
 *
 * @beta Part of `evlog/toolkit`.
 */
export interface HttpDrainRequest {
  /** Full request URL. */
  url: string
  /** Request headers (caller is responsible for `Content-Type`). */
  headers: Record<string, string>
  /** Pre-serialized request body. */
  body: string
}

/**
 * Definition of an HTTP drain.
 *
 * @beta Part of `evlog/toolkit`. Encapsulates URL/headers/body construction so
 * that adapters only ship config + `encode()` — no manual `fetch`, retries, or
 * timeouts.
 */
export interface HttpDrainOptions<TConfig> {
  /** Stable identifier used in error logs. */
  name: string
  /**
   * Resolve the runtime configuration. Return `null` to silently skip
   * draining (e.g. missing API key in development).
   */
  resolve: () => TConfig | null | Promise<TConfig | null>
  /**
   * Build the HTTP request from a batch of events and the resolved config.
   * Return `null` to skip the batch without raising.
   */
  encode: (events: WideEvent[], config: TConfig) => HttpDrainRequest | null
  /**
   * Default request timeout in milliseconds. Each adapter's config can still
   * provide a `timeout` field that overrides this.
   * @default 5000
   */
  timeout?: number
  /**
   * Default number of retries for transient failures.
   * @default 2
   */
  retries?: number
  /**
   * Read the request timeout off the resolved config. Falls back to
   * {@link HttpDrainOptions.timeout} when not provided.
   */
  resolveTimeout?: (config: TConfig) => number | undefined
  /**
   * Read the retry count off the resolved config. Falls back to
   * {@link HttpDrainOptions.retries} when not provided.
   */
  resolveRetries?: (config: TConfig) => number | undefined
}

const DEFAULT_HTTP_TIMEOUT = 5000

/**
 * Build a drain callback for HTTP backends with built-in `httpPost` semantics.
 *
 * Adapters only need to provide the config resolution and an `encode` function
 * that returns the URL, headers, and body for a batch of events. Timeouts and
 * retries are resolved from the config (with overrides via `resolveTimeout` /
 * `resolveRetries`) and forwarded to {@link httpPost}.
 *
 * @beta Part of `evlog/toolkit` — recommended base for community HTTP adapters.
 *
 * @example
 * ```ts
 * import { defineHttpDrain, resolveAdapterConfig, type ConfigField } from 'evlog/toolkit'
 *
 * interface MyConfig {
 *   apiKey: string
 *   endpoint?: string
 *   timeout?: number
 *   retries?: number
 * }
 *
 * const FIELDS: ConfigField<MyConfig>[] = [
 *   { key: 'apiKey', env: ['MY_API_KEY'] },
 *   { key: 'endpoint', env: ['MY_ENDPOINT'] },
 *   { key: 'timeout' },
 *   { key: 'retries' },
 * ]
 *
 * export function createMyDrain(overrides?: Partial<MyConfig>) {
 *   return defineHttpDrain<MyConfig>({
 *     name: 'my',
 *     resolve: async () => {
 *       const cfg = await resolveAdapterConfig<MyConfig>('my', FIELDS, overrides)
 *       if (!cfg.apiKey) return null
 *       return cfg as MyConfig
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
