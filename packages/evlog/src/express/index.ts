import { AsyncLocalStorage } from 'node:async_hooks'
import type { Request, Response, NextFunction, RequestHandler } from 'express'
import type { DrainContext, EnrichContext, RequestLogger, RouteConfig, TailSamplingContext } from '../types'
import { createMiddlewareLogger } from '../shared/middleware'
import { extractSafeNodeHeaders } from '../shared/headers'

const storage = new AsyncLocalStorage<RequestLogger>()

export interface EvlogExpressOptions {
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
}

declare module 'express-serve-static-core' {
  interface Request {
    log: RequestLogger
  }
}

/**
 * Get the request-scoped logger from anywhere in the call stack.
 * Must be called inside a request handled by the `evlog()` middleware.
 *
 * @example
 * ```ts
 * import { useLogger } from 'evlog/express'
 *
 * function findUser(id: string) {
 *   const log = useLogger()
 *   log.set({ user: { id } })
 * }
 * ```
 */
export function useLogger<T extends object = Record<string, unknown>>(): RequestLogger<T> {
  const logger = storage.getStore()
  if (!logger) {
    throw new Error(
      '[evlog] useLogger() was called outside of an evlog middleware context. '
      + 'Make sure app.use(evlog()) is registered before your routes.',
    )
  }
  return logger as RequestLogger<T>
}

/**
 * Create an evlog middleware for Express.
 *
 * @example
 * ```ts
 * import express from 'express'
 * import { evlog } from 'evlog/express'
 * import { createAxiomDrain } from 'evlog/axiom'
 *
 * const app = express()
 * app.use(evlog({
 *   drain: createAxiomDrain(),
 *   enrich: (ctx) => {
 *     ctx.event.region = process.env.FLY_REGION
 *   },
 * }))
 * ```
 */
export function evlog(options: EvlogExpressOptions = {}): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const { logger, finish, skipped } = createMiddlewareLogger({
      method: req.method,
      path: req.path,
      requestId: req.get('x-request-id') || crypto.randomUUID(),
      headers: extractSafeNodeHeaders(req.headers),
      ...options,
    })

    if (skipped) {
      next()
      return
    }

    req.log = logger

    res.on('finish', () => {
      finish({ status: res.statusCode }).catch(() => {})
    })

    storage.run(logger, () => next())
  }
}
