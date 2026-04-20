import type { Request, Response, NextFunction, RequestHandler } from 'express'
import type { RequestLogger } from '../types'
import { createMiddlewareLogger, type BaseEvlogOptions } from '../shared/middleware'
import { attachForkToLogger } from '../shared/fork'
import { extractSafeNodeHeaders } from '../shared/headers'
import { createLoggerStorage } from '../shared/storage'

const { storage, useLogger } = createLoggerStorage(
  'middleware context. Make sure app.use(evlog()) is registered before your routes.',
)

export type EvlogExpressOptions = BaseEvlogOptions

export { useLogger }

declare module 'express-serve-static-core' {
  interface Request {
    log: RequestLogger
  }
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
    const middlewareOpts = {
      method: req.method,
      path: new URL(req.originalUrl || req.url || '/', 'http://localhost').pathname,
      requestId: req.get('x-request-id') || crypto.randomUUID(),
      headers: extractSafeNodeHeaders(req.headers),
      ...options,
    }
    const { logger, finish, skipped } = createMiddlewareLogger(middlewareOpts)

    if (skipped) {
      next()
      return
    }

    attachForkToLogger(storage, logger, middlewareOpts)
    req.log = logger

    res.on('finish', () => {
      finish({ status: res.statusCode }).catch(() => {})
    })

    storage.run(logger, () => next())
  }
}
