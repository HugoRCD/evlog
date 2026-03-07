import type { MiddlewareHandler } from 'hono'
import type { RequestLogger } from '../types'
import { createMiddlewareLogger, type BaseEvlogOptions } from '../shared/middleware'
import { extractSafeHeaders } from '../shared/headers'

export interface EvlogHonoOptions extends BaseEvlogOptions {}

/**
 * Hono variables type for typed `c.get('log')` access.
 *
 * @example
 * ```ts
 * const app = new Hono<EvlogVariables>()
 * app.use(evlog())
 * app.get('/api/users', (c) => {
 *   const log = c.get('log')
 *   log.set({ users: { count: 42 } })
 *   return c.json({ users: [] })
 * })
 * ```
 */
export type EvlogVariables = { Variables: { log: RequestLogger } }

/**
 * Create an evlog middleware for Hono.
 *
 * @example
 * ```ts
 * import { Hono } from 'hono'
 * import { evlog, type EvlogVariables } from 'evlog/hono'
 * import { createAxiomDrain } from 'evlog/axiom'
 *
 * const app = new Hono<EvlogVariables>()
 * app.use(evlog({
 *   drain: createAxiomDrain(),
 *   enrich: (ctx) => {
 *     ctx.event.region = process.env.FLY_REGION
 *   },
 * }))
 * ```
 */
export function evlog(options: EvlogHonoOptions = {}): MiddlewareHandler {
  return async (c, next) => {
    const { logger, finish, skipped } = createMiddlewareLogger({
      method: c.req.method,
      path: c.req.path,
      requestId: c.req.header('x-request-id') || crypto.randomUUID(),
      headers: extractSafeHeaders(c.req.raw.headers),
      ...options,
    })

    if (skipped) {
      await next()
      return
    }

    c.set('log', logger)

    try {
      await next()
      await finish({ status: c.res.status })
    } catch (error) {
      await finish({ error: error as Error })
      throw error
    }
  }
}
