import type { Context, MiddlewareHandler } from 'hono'
import type { RequestLogger } from '../types'
import { defineFrameworkIntegration } from '../shared/integration'
import type { BaseEvlogOptions } from '../shared/middleware'

export type EvlogHonoOptions = BaseEvlogOptions

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

const integration = defineFrameworkIntegration<Context>({
  name: 'hono',
  extractRequest: (c) => ({
    method: c.req.method,
    path: c.req.path,
    headers: c.req.raw.headers,
    requestId: c.req.header('x-request-id'),
  }),
  attachLogger: (c, logger) => {
    c.set('log', logger)
  },
})

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
    const { skipped, finish } = integration.start(c, options)
    if (skipped) {
      await next()
      return
    }
    try {
      await next()
      await finish({ status: c.res.status })
    } catch (error) {
      await finish({ error: error as Error })
      throw error
    }
  }
}
