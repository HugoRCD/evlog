import type { DrainContext, EnrichContext, RequestLogger, RouteConfig, TailSamplingContext, WideEvent } from '../types'
import { createRequestLogger, isEnabled, shouldKeep } from '../logger'
import { extractErrorStatus } from '../nitro'
import { shouldLog, getServiceForPath } from './routes'

/**
 * Base options shared by all framework integrations.
 * Each framework adapter spreads its user-facing options into this.
 */
export interface MiddlewareLoggerOptions {
  method: string
  path: string
  requestId?: string
  include?: string[]
  exclude?: string[]
  routes?: Record<string, RouteConfig>
  /** Tail sampling callback — set `ctx.shouldKeep = true` to force-keep */
  keep?: (ctx: TailSamplingContext) => void | Promise<void>
  /** Drain callback — send events to external services */
  drain?: (ctx: DrainContext) => void | Promise<void>
  /** Enrich callback — add derived context after emit, before drain */
  enrich?: (ctx: EnrichContext) => void | Promise<void>
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

async function runEnrichAndDrain(
  emittedEvent: WideEvent,
  options: MiddlewareLoggerOptions,
  requestInfo: { method: string; path: string; requestId?: string },
  responseStatus?: number,
): Promise<void> {
  if (options.enrich) {
    const enrichCtx: EnrichContext = {
      event: emittedEvent,
      request: requestInfo,
      headers: options.headers,
      response: { status: responseStatus },
    }
    try {
      await options.enrich(enrichCtx)
    } catch (err) {
      console.error('[evlog] enrich failed:', err)
    }
  }

  if (options.drain) {
    const drainCtx: DrainContext = {
      event: emittedEvent,
      request: requestInfo,
      headers: options.headers,
    }
    try {
      await options.drain(drainCtx)
    } catch (err) {
      console.error('[evlog] drain failed:', err)
    }
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
  })

  const routeService = getServiceForPath(path, routes)
  if (routeService) {
    logger.set({ service: routeService })
  }

  const startTime = Date.now()
  const requestInfo = { method, path, requestId: resolvedRequestId }

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

    const forceKeep = tailCtx.shouldKeep || shouldKeep(tailCtx)
    const emittedEvent = logger.emit({ _forceKeep: forceKeep })

    if (emittedEvent && (options.enrich || options.drain)) {
      await runEnrichAndDrain(emittedEvent, options, requestInfo, resolvedStatus)
    }

    return emittedEvent
  }

  return { logger, finish, skipped: false }
}
