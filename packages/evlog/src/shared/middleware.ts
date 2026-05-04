import type { DrainContext, EnrichContext, RedactConfig, RequestLogger, RouteConfig, TailSamplingContext, WideEvent } from '../types'
import { createRequestLogger, getGlobalDrain, getGlobalPluginRunner, isEnabled, shouldKeep } from '../logger'
import { redactEvent, resolveRedactConfig } from '../redact'
import { extractErrorStatus } from './errors'
import type { EvlogPlugin, PluginRunner } from './plugin'
import { createPluginRunner, getEmptyPluginRunner } from './plugin'
import { shouldLog, getServiceForPath } from './routes'

/**
 * Base options shared by all framework integrations.
 *
 * Every framework-specific options interface (e.g. `EvlogExpressOptions`)
 * extends this type. If a framework needs extra fields it can add them
 * on top; otherwise the base is used as-is.
 *
 * @beta Part of `evlog/toolkit` — the public API for building custom integrations.
 */
export interface BaseEvlogOptions {
  /** Route patterns to include in logging (glob). If not set, all routes are logged */
  include?: string[]
  /** Route patterns to exclude from logging. Exclusions take precedence over inclusions */
  exclude?: string[]
  /** Route-specific service configuration */
  routes?: Record<string, RouteConfig>
  /**
   * Drain callback called with every emitted event.
   * Use with drain adapters (Axiom, OTLP, Sentry, etc.) or custom endpoints.
   */
  drain?: (ctx: DrainContext) => void | Promise<void>
  /**
   * Enrich callback called after emit, before drain.
   * Use to add derived context (geo, deployment info, user agent, etc.).
   */
  enrich?: (ctx: EnrichContext) => void | Promise<void>
  /**
   * Custom tail sampling callback.
   * Set `ctx.shouldKeep = true` to force-keep the log regardless of head sampling.
   */
  keep?: (ctx: TailSamplingContext) => void | Promise<void>
  /**
   * Auto-redaction configuration for PII protection.
   * `true` enables all built-in PII patterns. Pass an object for fine-grained control.
   * Applied before enrich/drain. Also applied at the core `emitWideEvent` level
   * when configured via `initLogger()`.
   */
  redact?: boolean | RedactConfig
  /**
   * Plugins registered for this middleware instance.
   *
   * Plugins are run in addition to the globally-registered ones from
   * `initLogger({ plugins })`. They can opt into `enrich`, `drain`, `keep`,
   * lifecycle hooks (`onRequestStart`, `onRequestFinish`), and per-request
   * logger decoration via `extendLogger`.
   *
   * @beta Part of `evlog/toolkit`.
   */
  plugins?: EvlogPlugin[]
}

/**
 * Internal options consumed by `createMiddlewareLogger`.
 * Extends `BaseEvlogOptions` with the request-specific fields
 * that framework adapters must provide.
 */
export interface MiddlewareLoggerOptions extends BaseEvlogOptions {
  method: string
  path: string
  requestId?: string
  /** Pre-filtered safe request headers (used for enrich/drain context) */
  headers?: Record<string, string>
}

export interface MiddlewareLoggerResult {
  logger: RequestLogger
  finish: (opts?: { status?: number; error?: Error }) => Promise<WideEvent | null>
  skipped: boolean
}

const noopResult: MiddlewareLoggerResult = {
  logger: {
    set() {},
    error() {},
    info() {},
    warn() {},
    emit() {
      return null 
    },
    getContext() {
      return {} 
    },
  },
  finish: () => Promise.resolve(null),
  skipped: true,
}

/**
 * Per-`options.plugins` cache for the merged runner. Keyed on the local
 * plugins array (stable across requests because it lives in the middleware
 * factory closure) and invalidated whenever the global runner reference
 * changes (i.e. someone called `initLogger` again).
 *
 * Without this cache, every request through `app.use(evlog({ plugins: [...] }))`
 * would re-allocate a `Map`, copy global+local plugin lists, and rebuild a
 * new `PluginRunner` (≈10 closures). At 100k req/s that's ≈1M short-lived
 * allocations per second on the hot path. The cache makes the slow path
 * O(1) after the first request.
 */
const runnerCache = new WeakMap<EvlogPlugin[], { global: PluginRunner; merged: PluginRunner }>()

/**
 * Resolve the effective plugin runner for a middleware invocation.
 *
 * Combines the middleware-level `plugins` with the globally-registered ones
 * (`initLogger({ plugins })`), de-duplicating by plugin `name`. Returns the
 * shared empty runner when no plugins are registered anywhere.
 *
 * The merged runner is cached per-`options.plugins` reference and invalidated
 * when `initLogger` rebuilds the global runner, so frequent middleware
 * invocations don't re-pay the merge cost.
 *
 * @beta Part of `evlog/toolkit`.
 */
export function resolveMiddlewarePluginRunner(options: { plugins?: EvlogPlugin[] }): PluginRunner {
  const global = getGlobalPluginRunner()
  const local = options.plugins
  if (!local || local.length === 0) return global

  const cached = runnerCache.get(local)
  if (cached && cached.global === global) return cached.merged

  const merged = new Map<string, EvlogPlugin>()
  for (const plugin of global.plugins) merged.set(plugin.name, plugin)
  for (const plugin of local) merged.set(plugin.name, plugin)
  if (merged.size === 0) return getEmptyPluginRunner()

  const runner = createPluginRunner(Array.from(merged.values()))
  runnerCache.set(local, { global, merged: runner })
  return runner
}

/**
 * Apply redact, enrich, and drain to an emitted wide event — same pipeline as
 * {@link createMiddlewareLogger}'s `finish`.
 *
 * @beta Part of `evlog/toolkit` — used by framework integrations and `fork()`.
 */
// eslint-disable-next-line max-params
export async function runEnrichAndDrain(
  emittedEvent: WideEvent,
  options: MiddlewareLoggerOptions,
  requestInfo: { method: string; path: string; requestId?: string },
  responseStatus?: number,
  plugins?: PluginRunner,
): Promise<void> {
  const runner = plugins ?? resolveMiddlewarePluginRunner(options)
  const resolvedRedact = resolveRedactConfig(options.redact)
  if (resolvedRedact) {
    redactEvent(emittedEvent, resolvedRedact)
  }

  if (options.enrich || runner.hasEnrich) {
    const enrichCtx: EnrichContext = {
      event: emittedEvent,
      request: requestInfo,
      headers: options.headers,
      response: { status: responseStatus },
    }
    if (options.enrich) {
      try {
        await options.enrich(enrichCtx)
      } catch (err) {
        console.error('[evlog] enrich failed:', err)
      }
    }
    if (runner.hasEnrich) {
      await runner.runEnrich(enrichCtx)
    }
  }

  const drain = options.drain ?? getGlobalDrain()
  const hasUserDrain = !!drain
  const hasPluginDrain = runner.hasDrain
  if (hasUserDrain || hasPluginDrain) {
    const drainCtx: DrainContext = {
      event: emittedEvent,
      request: requestInfo,
      headers: options.headers,
    }
    const tasks: Array<Promise<unknown>> = []
    if (hasUserDrain) {
      tasks.push(
        (async () => {
          try {
            await drain!(drainCtx)
          } catch (err) {
            console.error('[evlog] drain failed:', err)
          }
        })(),
      )
    }
    if (hasPluginDrain) {
      tasks.push(runner.runDrain(drainCtx))
    }
    await Promise.all(tasks)
  }
}

/**
 * Create a middleware-aware request logger with full lifecycle management.
 *
 * Handles the complete pipeline shared across all framework integrations:
 * route filtering, logger creation, service overrides, duration tracking,
 * tail sampling evaluation, event emission, enrichment, and draining.
 *
 * Framework adapters only need to:
 * 1. Extract method/path/requestId/headers from the framework request
 * 2. Call `createMiddlewareLogger()` with those + user options
 * 3. Check `skipped` — if true, skip to next middleware
 * 4. Store `logger` in framework-specific context (e.g., `c.set('log', logger)`)
 * 5. Call `finish({ status })` or `finish({ error })` at response end
 *
 * @beta Part of `evlog/toolkit` — the public API for building custom integrations.
 */
export function createMiddlewareLogger(options: MiddlewareLoggerOptions): MiddlewareLoggerResult {
  if (!isEnabled()) return noopResult

  const { method, path, requestId, include, exclude, routes, keep } = options

  if (!shouldLog(path, include, exclude)) {
    return noopResult
  }

  const resolvedRequestId = requestId || crypto.randomUUID()

  const logger = createRequestLogger({
    method,
    path,
    requestId: resolvedRequestId,
  }, { _deferDrain: true })

  const routeService = getServiceForPath(path, routes)
  if (routeService) {
    logger.set({ service: routeService })
  }

  const pluginRunner = resolveMiddlewarePluginRunner(options)
  if (pluginRunner.hasExtendLogger) {
    pluginRunner.applyExtendLogger(logger)
  }

  const startTime = Date.now()
  const requestInfo = { method, path, requestId: resolvedRequestId }

  if (pluginRunner.hasRequestLifecycle) {
    pluginRunner.runOnRequestStart({
      logger,
      request: requestInfo,
      headers: options.headers,
    })
  }

  const finish = async (opts?: { status?: number; error?: Error }): Promise<WideEvent | null> => {
    const { status, error } = opts ?? {}

    if (error) {
      logger.error(error)
      const errorStatus = extractErrorStatus(error)
      logger.set({ status: errorStatus })
    } else if (status !== undefined) {
      logger.set({ status })
    }

    const durationMs = Date.now() - startTime

    const resolvedStatus = error
      ? extractErrorStatus(error)
      : status ?? (logger.getContext().status as number | undefined)

    const tailCtx: TailSamplingContext = {
      status: resolvedStatus,
      duration: durationMs,
      path,
      method,
      context: logger.getContext(),
      shouldKeep: false,
    }

    if (keep) {
      await keep(tailCtx)
    }
    if (pluginRunner.hasKeep) {
      await pluginRunner.runKeep(tailCtx)
    }

    const forceKeep = tailCtx.shouldKeep || shouldKeep(tailCtx)
    const emittedEvent = logger.emit({ _forceKeep: forceKeep })

    if (
      emittedEvent
      && (options.enrich || options.drain || pluginRunner.hasEnrich || pluginRunner.hasDrain || getGlobalDrain())
    ) {
      await runEnrichAndDrain(emittedEvent, options, requestInfo, resolvedStatus, pluginRunner)
    }

    if (pluginRunner.hasRequestLifecycle) {
      pluginRunner.runOnRequestFinish({
        logger,
        request: requestInfo,
        headers: options.headers,
        event: emittedEvent,
        status: resolvedStatus,
        durationMs,
        error,
      })
    }

    return emittedEvent
  }

  return { logger, finish, skipped: false }
}
