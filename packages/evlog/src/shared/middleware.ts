import type { DrainContext, EnrichContext, RedactConfig, RequestLogger, RouteConfig, TailSamplingContext, WideEvent } from '../types'
import { createRequestLogger, getGlobalDrain, getGlobalPluginRunner, isEnabled, shouldKeep } from '../logger'
import { redactEvent, resolveRedactConfig } from '../redact'
import { extractErrorStatus } from './errors'
import type { EvlogPlugin, PluginRunner } from './plugin'
import { createPluginRunner, getEmptyPluginRunner } from './plugin'
import { shouldLog, getServiceForPath } from './routes'

/**
 * Base options shared by every framework integration. Re-exported via
 * `evlog/toolkit` so custom integrations can extend it.
 */
export interface BaseEvlogOptions {
  /** Route glob patterns to include. If unset, all routes are logged. */
  include?: string[]
  /** Route glob patterns to exclude. Takes precedence over `include`. */
  exclude?: string[]
  /** Per-route service overrides. */
  routes?: Record<string, RouteConfig>
  /** Drain callback invoked with every emitted event. */
  drain?: (ctx: DrainContext) => void | Promise<void>
  /** Enrich callback invoked after emit, before drain. */
  enrich?: (ctx: EnrichContext) => void | Promise<void>
  /** Tail sampling callback. Set `ctx.shouldKeep = true` to force-keep. */
  keep?: (ctx: TailSamplingContext) => void | Promise<void>
  /**
   * PII auto-redaction. `true` enables built-in patterns; pass an object for
   * fine-grained control. Applied before enrich/drain.
   */
  redact?: boolean | RedactConfig
  /** Plugins for this middleware, merged with globally-registered ones. */
  plugins?: EvlogPlugin[]
}

/** Internal options accepted by `createMiddlewareLogger`. */
export interface MiddlewareLoggerOptions extends BaseEvlogOptions {
  method: string
  path: string
  requestId?: string
  /** Pre-filtered safe request headers used for enrich/drain context. */
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

// Memoizes the merged runner per local plugins array (stable across requests
// because it lives in the middleware factory closure). Invalidated when
// `initLogger` swaps the global runner, so the merge cost is paid once.
const runnerCache = new WeakMap<EvlogPlugin[], { global: PluginRunner; merged: PluginRunner }>()

/**
 * Resolve the plugin runner for a middleware invocation by merging local
 * plugins with the globally-registered ones (deduplicated by `name`).
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
 * Apply redact, enrich, and drain to an emitted wide event — the same
 * pipeline used by {@link createMiddlewareLogger}'s `finish`.
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
 * Create a request logger with the full middleware pipeline: route filtering,
 * service overrides, duration tracking, tail sampling, emit, enrich, drain.
 *
 * Framework adapters extract method/path/requestId/headers, call this once
 * per request, and call `finish({ status | error })` when the response ends.
 * If `skipped` is `true`, the route was filtered out — bypass logging.
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
