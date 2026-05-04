import type { DrainContext, EnrichContext, EnvironmentContext, LoggerConfig, RedactConfig, SamplingConfig, TailSamplingContext } from '../types'
import type { BaseEvlogOptions } from './middleware'
import type { EvlogPlugin } from './plugin'

/**
 * Single-config shape accepted everywhere evlog is bootstrapped:
 *
 * - `initLogger(toLoggerConfig(config))` for global setup
 * - `evlog(config)` from any framework middleware (`evlog/hono`, `evlog/express`, …)
 * - The Nuxt module reads the same fields via runtimeConfig
 *
 * The shape is a superset of {@link LoggerConfig} (global runtime) and
 * {@link BaseEvlogOptions} (per-request middleware). Field semantics are
 * unified — drains, plugins, redact, sampling, etc. behave the same wherever
 * the config is consumed.
 *
 * Use {@link defineEvlog} to author one once and share it across the stack.
 *
 * @beta Part of `evlog/toolkit`.
 */
export interface EvlogConfig extends BaseEvlogOptions {
  /**
   * Override the auto-detected service name. Equivalent to
   * `env: { service }` in {@link LoggerConfig}.
   */
  service?: string
  /**
   * Override the auto-detected environment. Equivalent to
   * `env: { environment }` in {@link LoggerConfig}.
   */
  environment?: string
  /** Full environment context override (advanced). */
  env?: Partial<EnvironmentContext>
  /** Enable or disable all logging globally. */
  enabled?: boolean
  /** Enable pretty printing. Auto-detected from `NODE_ENV` when omitted. */
  pretty?: boolean
  /** Sampling rates and tail-sampling conditions. */
  sampling?: SamplingConfig
  /** Suppress built-in console output (useful when drains own the channel). */
  silent?: boolean
  /** When pretty is disabled, emit JSON strings (default) or raw objects. */
  stringify?: boolean
  /** Minimum severity for the global `log` API. */
  minLevel?: LoggerConfig['minLevel']
}

/**
 * Identity helper for authoring an evlog configuration with full type
 * inference and IDE auto-completion.
 *
 * Pass the result to `initLogger(toLoggerConfig(config))` at boot, and to your
 * framework middleware (e.g. `evlog(config)` from `evlog/hono`) at the same
 * time. One config, one source of truth.
 *
 * @beta Part of `evlog/toolkit`.
 *
 * @example
 * ```ts
 * import { defineEvlog, initLogger, drainPlugin } from 'evlog'
 * import { createAxiomDrain } from 'evlog/axiom'
 * import { createDefaultEnrichers } from 'evlog/enrichers'
 * import { evlog as evlogMiddleware } from 'evlog/hono'
 *
 * export const config = defineEvlog({
 *   service: 'checkout',
 *   redact: true,
 *   sampling: { rates: { info: 25 } },
 *   enrich: createDefaultEnrichers(),
 *   plugins: [drainPlugin('axiom', createAxiomDrain())],
 * })
 *
 * initLogger(toLoggerConfig(config))
 * app.use(evlogMiddleware(config))
 * ```
 */
export function defineEvlog<T extends EvlogConfig>(config: T): T {
  return config
}

/**
 * Project an {@link EvlogConfig} onto the {@link LoggerConfig} surface
 * accepted by `initLogger`.
 *
 * Strips middleware-only fields (`include`, `exclude`, `routes`, `enrich`,
 * `keep`) since those are per-request concerns. Drains and plugins are
 * preserved so global emits go through the same pipeline as middleware emits.
 *
 * @beta Part of `evlog/toolkit`.
 */
export function toLoggerConfig(config: EvlogConfig): LoggerConfig {
  const env: Partial<EnvironmentContext> | undefined = config.env
    ? { ...config.env }
    : config.service || config.environment
      ? {}
      : undefined
  if (env) {
    if (config.service) env.service = config.service
    if (config.environment) env.environment = config.environment
  }
  const out: LoggerConfig = {}
  if (env) out.env = env
  if (config.enabled !== undefined) out.enabled = config.enabled
  if (config.pretty !== undefined) out.pretty = config.pretty
  if (config.sampling !== undefined) out.sampling = config.sampling
  if (config.minLevel !== undefined) out.minLevel = config.minLevel
  if (config.stringify !== undefined) out.stringify = config.stringify
  if (config.silent !== undefined) out.silent = config.silent
  if (config.redact !== undefined) out.redact = config.redact as boolean | RedactConfig | undefined
  if (config.drain) out.drain = config.drain
  if (config.plugins) out.plugins = config.plugins
  return out
}

/**
 * Project an {@link EvlogConfig} onto the {@link BaseEvlogOptions} surface
 * accepted by framework middlewares.
 *
 * @beta Part of `evlog/toolkit`.
 */
export function toMiddlewareOptions<T extends BaseEvlogOptions>(config: EvlogConfig): T {
  const out: BaseEvlogOptions = {}
  if (config.include) out.include = config.include
  if (config.exclude) out.exclude = config.exclude
  if (config.routes) out.routes = config.routes
  if (config.drain) out.drain = config.drain as (ctx: DrainContext) => void | Promise<void>
  if (config.enrich) out.enrich = config.enrich as (ctx: EnrichContext) => void | Promise<void>
  if (config.keep) out.keep = config.keep as (ctx: TailSamplingContext) => void | Promise<void>
  if (config.redact !== undefined) out.redact = config.redact as boolean | RedactConfig | undefined
  if (config.plugins) out.plugins = config.plugins as EvlogPlugin[]
  return out as T
}
