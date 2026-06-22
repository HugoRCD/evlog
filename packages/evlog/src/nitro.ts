import type { EnvironmentContext, LogLevel, RedactConfig, RouteConfig, SamplingConfig } from './types'
import type { DevTerminalInput, DevTerminalResolveInput } from './shared/dev-terminal'
import { extractErrorStatus } from './shared/errors'
import { resolveDevTerminal, shouldShowFrameworkOverlay } from './shared/dev-terminal'
import { readEvlogConfigSync } from './shared/nitroConfigBridge'

export type { DevTerminalInput, DevTerminalPreset, DevPrettyErrorConfig, DevTerminalConfigObject, ResolvedPrettyError } from './shared/dev-terminal'
export { resolveDevTerminal, shouldShowFrameworkOverlay } from './shared/dev-terminal'

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
   * Dev terminal output: preset or explicit overlay + pretty-error settings.
   * @default 'evlog' when pretty in development
   */
  dev?: DevTerminalInput

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
export interface NitroPluginEvlogConfig extends DevTerminalResolveInput {
  enabled?: boolean
  env?: Record<string, unknown>
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

/** Request metadata used to decide JSON vs framework error-page rendering. */
export interface NitroErrorRequestContext {
  pathname: string
  getHeader(name: string): string | undefined
}

function acceptIncludes(accept: string | undefined, mediaType: string): boolean {
  return accept?.toLowerCase().includes(mediaType) ?? false
}

function isNitroApiPath(pathname: string): boolean {
  return pathname.startsWith('/api/')
}

/**
 * Whether evlog's Nitro error handler should flush a JSON body itself.
 *
 * Returns `false` for document/page requests so Nitro can delegate to the next
 * handler in the chain (e.g. Nuxt's `error.vue` renderer). EvlogError and API
 * routes always serialize as JSON.
 *
 * @internal
 */
export function shouldSerializeNitroErrorAsJson(
  request: NitroErrorRequestContext,
  evlogError: Error | null,
): boolean {
  if (evlogError) return true

  const { pathname, getHeader } = request

  if (isNitroApiPath(pathname)) return true

  const secFetchDest = getHeader('sec-fetch-dest')
  if (secFetchDest === 'document') return false

  const secFetchMode = getHeader('sec-fetch-mode')
  if (secFetchMode === 'navigate') return false

  const accept = getHeader('accept')

  if (getHeader('x-requested-with')?.toLowerCase() === 'xmlhttprequest') return true

  if (acceptIncludes(accept, 'application/json') && !acceptIncludes(accept, 'text/html')) {
    return true
  }

  if (acceptIncludes(accept, 'text/html')) return false

  // fetch/curl without HTML signals — preserve standalone Nitro JSON behavior
  return true
}

/**
 * Mark an h3 event handled synchronously.
 * Nitro chains a built-in dev handler after custom handlers; `send()` defers
 * `res.end`, so without this the Youch overlay still runs.
 * @internal
 */
export function markH3ErrorHandled(event: { _handled?: boolean }): void {
  event._handled = true
}

/**
 * Prepend evlog's Nitro error handler so it runs before framework handlers (e.g. Nuxt).
 * @internal
 */
export function prependNitroErrorHandler(
  errorHandler: string | string[] | undefined,
  handlerPath: string,
): string | string[] {
  if (!errorHandler) return handlerPath
  if (Array.isArray(errorHandler)) {
    const rest = errorHandler.filter(h => h !== handlerPath)
    return [handlerPath, ...rest]
  }
  if (errorHandler === handlerPath) return handlerPath
  return [handlerPath, errorHandler]
}

/**
 * Whether the Nitro dev Youch overlay should be suppressed for this process.
 * @internal
 */
let cachedConfigKey: string | undefined
let cachedSuppressOverlay: boolean | undefined

export function shouldSuppressNitroDevOverlay(): boolean {
  const config = readEvlogConfigSync()
  const key = config ? JSON.stringify(config) : ''
  if (cachedSuppressOverlay !== undefined && cachedConfigKey === key) {
    return cachedSuppressOverlay
  }

  cachedConfigKey = key
  cachedSuppressOverlay = !resolveDevTerminal(config ?? {}).frameworkOverlay
  return cachedSuppressOverlay
}

/** @internal Reset overlay decision cache — tests only. */
export function resetNitroDevOverlayCache(): void {
  cachedConfigKey = undefined
  cachedSuppressOverlay = undefined
}

/**
 * Clear Nitro/h3 unhandled flags so the dev Youch logger skips this error.
 * @internal
 */
export function suppressNitroDevOverlay(error: Error): void {
  const err = error as Error & { unhandled?: boolean; fatal?: boolean }
  err.unhandled = false
  err.fatal = false
}

/**
 * Build Nitro-compatible JSON for non-EvlogError throws.
 * Sanitizes 5xx messages in production.
 */
export function buildPlainNitroErrorBody(
  error: Error,
  url: string,
  isDev = process.env.NODE_ENV === 'development',
): Record<string, unknown> {
  const status = extractErrorStatus(error)
  const rawMessage = ((error as { statusText?: string }).statusText
    ?? (error as { statusMessage?: string }).statusMessage
    ?? error.message) || 'Internal Server Error'
  const message = isDev
    ? rawMessage
    : (status >= 500 ? 'Internal Server Error' : rawMessage)

  return {
    url,
    status,
    statusCode: status,
    statusText: message,
    statusMessage: message,
    message,
    error: true,
  }
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

