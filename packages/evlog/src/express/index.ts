import type { Request, Response, NextFunction, RequestHandler } from 'express'
import type { RequestLogger } from '../types'
import { defineFrameworkIntegration } from '../shared/integration'
import type { BaseEvlogOptions } from '../shared/middleware'
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

const integration = defineFrameworkIntegration<Request>({
  name: 'express',
  extractRequest: (req) => ({
    method: req.method,
    path: new URL(req.originalUrl || req.url || '/', 'http://localhost').pathname,
    headers: req.headers,
    requestId: req.get('x-request-id'),
  }),
  attachLogger: (req, logger) => {
    req.log = logger
  },
  storage,
})

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
    const { finish, skipped, runWith } = integration.start(req, options)

    if (skipped) {
      next()
      return
    }

    res.on('finish', () => {
      finish({ status: res.statusCode }).catch(() => {})
    })

    void runWith(() => next())
  }
}
