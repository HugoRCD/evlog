import type { EnvironmentContext, RouteConfig, SamplingConfig } from './types'
import { matchesPattern } from './utils'

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

export function shouldLog(path: string, include?: string[], exclude?: string[]): boolean {
  // Check exclusions first (they take precedence)
  if (exclude && exclude.length > 0) {
    if (exclude.some(pattern => matchesPattern(path, pattern))) {
      return false
    }
  }

  // If no include patterns, log everything (that wasn't excluded)
  if (!include || include.length === 0) {
    return true
  }

  // Log only if path matches at least one include pattern
  return include.some(pattern => matchesPattern(path, pattern))
}

/**
 * Find the service name for a given path based on route patterns.
 *
 * When multiple patterns match the same path, the first matching pattern wins
 * based on object iteration order. To ensure predictable behavior, order your
 * route patterns from most specific to most general.
 *
 * @param path - The request path to match
 * @param routes - Route configuration mapping patterns to service names
 * @returns The service name for the matching route, or undefined if no match
 *
 * @example
 * ```ts
 * // Good: specific patterns first, general patterns last
 * routes: {
 *   '/api/auth/admin/**': { service: 'admin-service' },
 *   '/api/auth/**': { service: 'auth-service' },
 *   '/api/**': { service: 'api-service' },
 * }
 * ```
 */
export function getServiceForPath(path: string, routes?: Record<string, RouteConfig>): string | undefined {
  if (!routes) return undefined

  for (const [pattern, config] of Object.entries(routes)) {
    if (matchesPattern(path, pattern)) {
      return config.service
    }
  }

  return undefined
}
