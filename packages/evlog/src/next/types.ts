import type { DrainContext, EnrichContext, EnvironmentContext, RouteConfig, SamplingConfig, TailSamplingContext } from '../types'

export interface NextEvlogOptions {
  /**
   * Service name for all logged events.
   * @default auto-detected from SERVICE_NAME env or 'app'
   */
  service?: string

  /**
   * Environment context overrides.
   */
  env?: Partial<EnvironmentContext>

  /**
   * Enable pretty printing.
   * @default true in development, false in production
   */
  pretty?: boolean

  /**
   * Enable or disable all logging globally.
   * @default true
   */
  enabled?: boolean

  /**
   * Sampling configuration for filtering logs.
   */
  sampling?: SamplingConfig

  /**
   * Route patterns to include in logging.
   * Supports glob patterns like '/api/**'.
   * If not set, all routes are logged.
   */
  include?: string[]

  /**
   * Route patterns to exclude from logging.
   * Supports glob patterns like '/_next/**'.
   * Exclusions take precedence over inclusions.
   */
  exclude?: string[]

  /**
   * Route-specific service configuration.
   */
  routes?: Record<string, RouteConfig>

  /**
   * Drain callback called with every emitted event (fire-and-forget).
   * Compatible with drain adapters and pipeline-wrapped drains.
   */
  drain?: (ctx: DrainContext) => void | Promise<void>

  /**
   * Enrich callback called after emit, before drain.
   * Use this to add derived context (e.g. geo, deployment info).
   */
  enrich?: (ctx: EnrichContext) => void | Promise<void>

  /**
   * Custom tail sampling callback called before emit.
   * Set `ctx.shouldKeep = true` to force-keep the log regardless of head sampling.
   * Equivalent to Nuxt's `evlog:emit:keep` hook.
   */
  keep?: (ctx: TailSamplingContext) => void | Promise<void>

  /**
   * When pretty is disabled, emit JSON strings (default) or raw objects.
   * @default true
   */
  stringify?: boolean
}

export interface EvlogMiddlewareConfig {
  /**
   * Route patterns to include in middleware processing.
   * Supports glob patterns like '/api/**'.
   */
  include?: string[]

  /**
   * Route patterns to exclude from middleware processing.
   * Supports glob patterns like '/_next/**'.
   */
  exclude?: string[]
}
