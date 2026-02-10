import type { NitroRuntimeHooks } from 'nitropack/types'

declare module 'nitropack/types' {
  interface NitroRuntimeHooks {
    /**
     * Tail sampling hook - called before emitting a log.
     * Set `ctx.shouldKeep = true` to force-keep the log regardless of head sampling.
     *
     * @example
     * ```ts
     * nitroApp.hooks.hook('evlog:emit:keep', (ctx) => {
     *   if (ctx.context.user?.premium) {
     *     ctx.shouldKeep = true
     *   }
     * })
     * ```
     */
    'evlog:emit:keep': (ctx: TailSamplingContext) => void | Promise<void>

    /**
     * Enrichment hook - called after emit, before drain.
     * Use this to enrich the event with derived context (e.g. geo, user agent).
     *
     * @example
     * ```ts
     * nitroApp.hooks.hook('evlog:enrich', (ctx) => {
     *   ctx.event.deploymentId = process.env.DEPLOYMENT_ID
     * })
     * ```
     */
    'evlog:enrich': (ctx: EnrichContext) => void | Promise<void>

    /**
     * Drain hook - called after emitting a log (fire-and-forget).
     * Use this to send logs to external services like Axiom, Loki, or custom endpoints.
     * Errors are logged but never block the request.
     *
     * @example
     * ```ts
     * nitroApp.hooks.hook('evlog:drain', async (ctx) => {
     *   await fetch('https://api.axiom.co/v1/datasets/logs/ingest', {
     *     method: 'POST',
     *     headers: { Authorization: `Bearer ${process.env.AXIOM_TOKEN}` },
     *     body: JSON.stringify([ctx.event])
     *   })
     * })
     * ```
     */
    'evlog:drain': (ctx: DrainContext) => void | Promise<void>
  }
}

/**
 * Transport configuration for sending client logs to the server
 */
export interface TransportConfig {
  /**
   * Enable sending logs to the server API
   * @default false
   */
  enabled?: boolean

  /**
   * API endpoint for log ingestion
   * @default '/api/_evlog/ingest'
   */
  endpoint?: string
}

/**
 * Payload sent from client to server for log ingestion
 */
export interface IngestPayload {
  timestamp: string
  level: 'info' | 'error' | 'warn' | 'debug'
  [key: string]: unknown
}

/**
 * Sampling rates per log level (0-100 percentage)
 */
export interface SamplingRates {
  /** Percentage of info logs to keep (0-100). Default: 100 */
  info?: number
  /** Percentage of warn logs to keep (0-100). Default: 100 */
  warn?: number
  /** Percentage of debug logs to keep (0-100). Default: 100 */
  debug?: number
  /** Percentage of error logs to keep (0-100). Default: 100 */
  error?: number
}

/**
 * Tail sampling condition for forcing log retention based on request outcome.
 * All conditions use >= comparison (e.g., status: 400 means status >= 400).
 */
export interface TailSamplingCondition {
  /** Keep if HTTP status >= this value (e.g., 400 for all errors) */
  status?: number
  /** Keep if request duration >= this value in milliseconds */
  duration?: number
  /** Keep if path matches this glob pattern (e.g., '/api/critical/**') */
  path?: string
}

/**
 * Context passed to tail sampling evaluation and hooks.
 * Contains request outcome information for sampling decisions.
 */
export interface TailSamplingContext {
  /** HTTP response status code */
  status?: number
  /** Request duration in milliseconds (raw number) */
  duration?: number
  /** Request path */
  path?: string
  /** HTTP method */
  method?: string
  /** Full accumulated context from the request logger */
  context: Record<string, unknown>
  /**
   * Set to true in evlog:emit:keep hook to force keep this log.
   * Multiple hooks can set this - if any sets it to true, the log is kept.
   */
  shouldKeep?: boolean
}

/**
 * Context passed to the evlog:enrich hook.
 * Called after emit, before drain.
 */
export interface EnrichContext {
  /** The emitted wide event (mutable). */
  event: WideEvent
  /** Request metadata (if available) */
  request?: {
    method?: string
    path?: string
    requestId?: string
  }
  /** Safe HTTP request headers (sensitive headers filtered out) */
  headers?: Record<string, string>
  /** Optional response metadata */
  response?: {
    status?: number
    headers?: Record<string, string>
  }
}

/**
 * Context passed to the evlog:drain hook.
 * Contains the complete wide event and request metadata for external transport.
 */
export interface DrainContext {
  /** The complete wide event to drain */
  event: WideEvent
  /** Request metadata (if available) */
  request?: {
    method?: string
    path?: string
    requestId?: string
  }
  /** HTTP headers from the original request (useful for correlation with external services) */
  headers?: Record<string, string>
}

/**
 * Sampling configuration for filtering logs
 */
export interface SamplingConfig {
  /**
   * Sampling rates per log level (head sampling).
   * Values are percentages from 0 to 100.
   * Default: 100 for all levels (log everything).
   * Error defaults to 100 even if not specified.
   *
   * @example
   * ```ts
   * sampling: {
   *   rates: {
   *     info: 10,    // Keep 10% of info logs
   *     warn: 50,    // Keep 50% of warning logs
   *     debug: 5,    // Keep 5% of debug logs
   *     error: 100,  // Always keep errors (default)
   *   }
   * }
   * ```
   */
  rates?: SamplingRates

  /**
   * Tail sampling conditions for forcing log retention (OR logic).
   * If ANY condition matches, the log is kept regardless of head sampling.
   * Use the `evlog:emit:keep` Nitro hook for custom conditions.
   *
   * @example
   * ```ts
   * sampling: {
   *   rates: { info: 10 },  // Head sampling: keep 10% of info logs
   *   keep: [
   *     { status: 400 },     // Always keep if status >= 400
   *     { duration: 1000 },  // Always keep if duration >= 1000ms
   *     { path: '/api/critical/**' },  // Always keep critical paths
   *   ]
   * }
   * ```
   */
  keep?: TailSamplingCondition[]
}

/**
 * Route-based service configuration
 */
export interface RouteConfig {
  /** Service name to use for routes matching this pattern */
  service: string
}

/**
 * Environment context automatically included in every log event
 */
export interface EnvironmentContext {
  /** Service name (auto-detected from package.json or configurable) */
  service: string
  /** Environment: 'development', 'production', 'test', etc. */
  environment: 'development' | 'production' | 'test' | string
  /** Application version (auto-detected from package.json) */
  version?: string
  /** Git commit hash (auto-detected from CI/CD env vars) */
  commitHash?: string
  /** Deployment region (auto-detected from cloud provider env vars) */
  region?: string
}

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  /** Environment context overrides */
  env?: Partial<EnvironmentContext>
  /** Enable pretty printing (auto-detected: true in dev, false in prod) */
  pretty?: boolean
  /** Sampling configuration for filtering logs */
  sampling?: SamplingConfig
  /**
   * When pretty is disabled, emit JSON strings (default) or raw objects.
   * Set to false for environments like Cloudflare Workers that expect objects.
   * @default true
   */
  stringify?: boolean
  /**
   * Drain callback called with every emitted event (fire-and-forget).
   * Use this to send logs to external services outside of Nitro.
   * Compatible with drain adapters (`createAxiomDrain()`) and pipeline-wrapped drains.
   *
   * @example
   * ```ts
   * import { initLogger, log } from 'evlog'
   * import { createAxiomDrain } from 'evlog/axiom'
   *
   * initLogger({
   *   drain: createAxiomDrain({ dataset: 'logs', token: '...' }),
   * })
   *
   * log.info({ action: 'user_login' }) // automatically drained
   * ```
   *
   * @example
   * ```ts
   * // With pipeline for batching and retry
   * import { createDrainPipeline } from 'evlog/pipeline'
   *
   * const pipeline = createDrainPipeline({ batch: { size: 25 } })
   * const drain = pipeline(createAxiomDrain({ dataset: 'logs', token: '...' }))
   *
   * initLogger({ drain })
   *
   * // Flush on shutdown
   * process.on('beforeExit', () => drain.flush())
   * ```
   */
  drain?: (ctx: DrainContext) => void | Promise<void>
}

/**
 * Base structure for all wide events
 */
export interface BaseWideEvent {
  timestamp: string
  level: 'info' | 'error' | 'warn' | 'debug'
  service: string
  environment: string
  version?: string
  commitHash?: string
  region?: string
}

/**
 * Wide event with arbitrary additional fields
 */
export type WideEvent = BaseWideEvent & Record<string, unknown>

/**
 * Fields set internally by the evlog plugin (status, service, etc.).
 * These are always accepted by `set()` regardless of the user-defined field type.
 */
export interface InternalFields {
  status?: number
  service?: string
}

/**
 * Request-scoped logger for building wide events
 *
 * @example
 * ```ts
 * const logger = useLogger(event)
 * logger.set({ user: { id: '123' } })
 * logger.set({ cart: { items: 3 } })
 * // emit() is called automatically by the plugin
 * ```
 *
 * @example
 * ```ts
 * // With typed fields for compile-time safety
 * interface MyFields {
 *   user: { id: string; plan: string }
 *   action: string
 * }
 * const logger = useLogger<MyFields>(event)
 * logger.set({ user: { id: '123', plan: 'pro' } }) // OK
 * logger.set({ action: 'checkout' })                 // OK
 * logger.set({ status: 200 })                        // OK (internal field)
 * logger.set({ account: '...' })                     // TS error
 * ```
 */
export interface RequestLogger<T extends object = Record<string, unknown>> {
  /**
   * Add context to the wide event (deep merge via defu)
   */
  set: (context: Partial<T & InternalFields>) => void

  /**
   * Log an error and capture its details
   */
  error: (error: Error | string, context?: Partial<T & InternalFields>) => void

  /**
   * Emit the final wide event with all accumulated context.
   * Returns the emitted WideEvent, or null if the log was sampled out.
   */
  emit: (overrides?: Partial<T & InternalFields> & { _forceKeep?: boolean }) => WideEvent | null

  /**
   * Get the current accumulated context
   */
  getContext: () => Partial<T & InternalFields> & Record<string, unknown>
}

/**
 * Log level type
 */
export type LogLevel = 'info' | 'error' | 'warn' | 'debug'

/**
 * Simple logging API - as easy as console.log
 *
 * @example
 * ```ts
 * log.info('auth', 'User logged in')
 * log.error({ action: 'payment', error: 'failed' })
 * ```
 */
export interface Log {
  /**
   * Log an info message or wide event
   * @example log.info('auth', 'User logged in')
   * @example log.info({ action: 'login', userId: '123' })
   */
  info(tag: string, message: string): void
  info(event: Record<string, unknown>): void

  /**
   * Log an error message or wide event
   * @example log.error('payment', 'Payment failed')
   * @example log.error({ action: 'payment', error: 'declined' })
   */
  error(tag: string, message: string): void
  error(event: Record<string, unknown>): void

  /**
   * Log a warning message or wide event
   * @example log.warn('api', 'Rate limit approaching')
   * @example log.warn({ action: 'api', remaining: 10 })
   */
  warn(tag: string, message: string): void
  warn(event: Record<string, unknown>): void

  /**
   * Log a debug message or wide event
   * @example log.debug('cache', 'Cache miss')
   * @example log.debug({ action: 'cache', key: 'user_123' })
   */
  debug(tag: string, message: string): void
  debug(event: Record<string, unknown>): void
}

/**
 * Error options for creating structured errors
 */
export interface ErrorOptions {
  /** What actually happened */
  message: string
  /** HTTP status code (default: 500) */
  status?: number
  /** Why this error occurred */
  why?: string
  /** How to fix this issue */
  fix?: string
  /** Link to documentation or more information */
  link?: string
  /** The original error that caused this */
  cause?: Error
}

/**
 * Options for creating a request logger
 */
export interface RequestLoggerOptions {
  method?: string
  path?: string
  requestId?: string
}

/**
 * H3 event context with evlog logger attached
 */
export interface H3EventContext {
  log?: RequestLogger
  requestId?: string
  status?: number
  /** Internal: start time for duration calculation in tail sampling */
  _evlogStartTime?: number
  /** Internal: flag to prevent double emission on errors */
  _evlogEmitted?: boolean
  [key: string]: unknown
}

/**
 * Server event type for Nitro/h3 handlers
 */
export interface ServerEvent {
  method: string
  path: string
  context: H3EventContext & {
    /** Cloudflare Workers context (available when deployed to CF Workers) */
    cloudflare?: {
      context: {
        waitUntil: (promise: Promise<unknown>) => void
      }
    }
    /** Vercel Edge context (available when deployed to Vercel Edge) */
    waitUntil?: (promise: Promise<unknown>) => void
  }
  node?: { res?: { statusCode?: number } }
  response?: Response
}

/**
 * Parsed evlog error with all fields at the top level
 */
export interface ParsedError {
  message: string
  status: number
  why?: string
  fix?: string
  link?: string
  raw: unknown
}
