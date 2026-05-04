import type { EnvironmentContext, LogLevel, RedactConfig, RouteConfig, SamplingConfig } from './types'
import { extractErrorStatus } from './shared/errors'

export { shouldLog, getServiceForPath } from './shared/routes'

export interface NitroModuleOptions {
  /**
   * Enable or disable all logging globally.
   * @default true
   */
  enabled?: boolean

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
   * Suppress built-in console output.
   * When true, events are still built, sampled, and passed to drains,
   * but nothing is written to console. Use when drains own the output
   * channel (e.g., stdout-based platforms like GCP Cloud Run, AWS Lambda).
   * @default false
   */
  silent?: boolean

  /**
   * Route patterns to include in logging.
   * Supports glob patterns like '/api/**'.
   * If not set, all routes are logged.
   */
  include?: string[]

  /**
   * Route patterns to exclude from logging.
   * Supports glob patterns like '/_nitro/**'.
   * Exclusions take precedence over inclusions.
   */
  exclude?: string[]

  /**
   * Route-specific service configuration.
   */
  routes?: Record<string, RouteConfig>

  /**
   * Sampling configuration for filtering logs.
   */
  sampling?: SamplingConfig

  /**
   * Minimum severity for the global `log` API (not request wide events).
   * Order: debug < info < warn < error.
   * @default 'debug'
   */
  minLevel?: LogLevel

  /**
   * Auto-redaction configuration for PII protection.
   * `true` enables all built-in PII patterns. Pass an object for fine-grained control.
   */
  redact?: boolean | RedactConfig
}

/**
 * JSON-friendly subset of evlog Nitro plugin options consumed by the Nitro/Nuxt
 * runtime (read from `runtimeConfig.evlog` or the `__EVLOG_CONFIG` env bridge).
 *
 * @internal Internal Nitro contract — do not use from application code. Use
 * {@link import('./shared/define').EvlogConfig} for the canonical user-facing
 * config shape.
 */
export interface NitroPluginEvlogConfig {
  enabled?: boolean
  env?: Record<string, unknown>
  pretty?: boolean
  silent?: boolean
  include?: string[]
  exclude?: string[]
  routes?: Record<string, RouteConfig>
  sampling?: SamplingConfig
  minLevel?: LogLevel
  redact?: boolean | RedactConfig | Record<string, unknown>
}

/** @deprecated Renamed to {@link NitroPluginEvlogConfig}. Kept for backward compat. */
export type EvlogConfig = NitroPluginEvlogConfig

/**
 * Resolve an EvlogError from an error or its cause chain.
 * Both Nitro v2 (h3) and v3 wrap thrown errors — this unwraps them.
 */
export function resolveEvlogError(error: Error): Error | null {
  if (error.name === 'EvlogError') return error
  if ((error.cause as Error)?.name === 'EvlogError') return error.cause as Error
  return null
}

export { extractErrorStatus } from './shared/errors'

/**
 * Build a standard evlog error JSON response body.
 * Used by both v2 and v3 error handlers to ensure consistent shape.
 */
export function serializeEvlogErrorResponse(error: Error, url: string): Record<string, unknown> {
  const status = extractErrorStatus(error)
  const { data } = error as { data?: unknown }
  const statusMessage = (error as { statusMessage?: string }).statusMessage || error.message
  return {
    url,
    status,
    statusCode: status,
    statusText: statusMessage,
    statusMessage,
    message: error.message,
    error: true,
    ...(data !== undefined && { data }),
  }
}

