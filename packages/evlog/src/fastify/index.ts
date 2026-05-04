import type { FastifyPluginCallback, FastifyRequest } from 'fastify'
import { defineFrameworkIntegration } from '../shared/integration'
import type { BaseEvlogOptions } from '../shared/middleware'
import { createLoggerStorage } from '../shared/storage'

const { storage, useLogger } = createLoggerStorage(
  'plugin context. Make sure app.register(evlog) is called before your routes.',
)

export type EvlogFastifyOptions = BaseEvlogOptions

export { useLogger }

declare module 'fastify' {
  interface FastifyRequest {
    // Overrides Fastify's built-in pino logger on the request with evlog's RequestLogger.
    log: any
  }
}

interface RequestState {
  finish: (opts?: { status?: number; error?: Error }) => Promise<unknown>
}

const integration = defineFrameworkIntegration<FastifyRequest>({
  name: 'fastify',
  extractRequest: (req) => ({
    method: req.method,
    path: new URL(req.url, 'http://localhost').pathname,
    headers: req.headers,
    requestId: typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : undefined,
  }),
  attachLogger: (req, logger) => {
    (req as any).log = logger
  },
  storage,
})

const evlogPlugin: FastifyPluginCallback<EvlogFastifyOptions> = (fastify, options, done) => {
  const emitted = new WeakSet<object>()
  const requestState = new WeakMap<object, RequestState>()

  fastify.addHook('onRequest', (request, _reply, next) => {
    const { finish, skipped, runWith } = integration.start(request, options)
    if (skipped) {
      next()
      return
    }
    requestState.set(request, { finish })
    void runWith(() => next())
  })

  fastify.addHook('onResponse', async (request, reply) => {
    const state = requestState.get(request)
    if (!state || emitted.has(request)) return
    emitted.add(request)
    await state.finish({ status: reply.statusCode })
  })

  fastify.addHook('onError', async (request, _reply, error) => {
    const state = requestState.get(request)
    if (!state || emitted.has(request)) return
    emitted.add(request)
    const logger = (request as any).log
    const err = error instanceof Error ? error : new Error(String(error))
    if (logger && typeof logger.error === 'function') logger.error(err)
    await state.finish({ error: err })
  })

  done()
}

const plugin = evlogPlugin as any
plugin[Symbol.for('skip-override')] = true
plugin[Symbol.for('fastify.display-name')] = 'evlog'

/**
 * Create an evlog plugin for Fastify.
 *
 * @example
 * ```ts
 * import Fastify from 'fastify'
 * import { initLogger } from 'evlog'
 * import { evlog } from 'evlog/fastify'
 * import { createAxiomDrain } from 'evlog/axiom'
 *
 * initLogger({ env: { service: 'fastify-api' } })
 *
 * const app = Fastify()
 * await app.register(evlog, {
 *   drain: createAxiomDrain(),
 *   enrich: (ctx) => {
 *     ctx.event.region = process.env.FLY_REGION
 *   },
 * })
 * ```
 */
export const evlog = evlogPlugin
