import type { EnvironmentContext, RouteConfig, SamplingConfig } from './types'

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
}

export interface EvlogConfig {
  enabled?: boolean
  env?: Record<string, unknown>
  pretty?: boolean
  include?: string[]
  exclude?: string[]
  routes?: Record<string, RouteConfig>
  sampling?: SamplingConfig
}

/**
 * Resolve an EvlogError from an error or its cause chain.
 * Both Nitro v2 (h3) and v3 wrap thrown errors — this unwraps them.
 */
export function resolveEvlogError(error: Error): Error | null {
  if (error.name === 'EvlogError') return error
  if ((error.cause as Error)?.name === 'EvlogError') return error.cause as Error
  return null
}

/**
 * Extract HTTP status from an error, checking both `status` and `statusCode`.
 */
export function extractErrorStatus(error: unknown): number {
  return (error as { status?: number }).status
    ?? (error as { statusCode?: number }).statusCode
    ?? 500
}

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

