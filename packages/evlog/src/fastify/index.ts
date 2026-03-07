import type { FastifyPluginCallback } from 'fastify'
import type { RequestLogger } from '../types'
import { createMiddlewareLogger, type BaseEvlogOptions } from '../shared/middleware'
import { extractSafeNodeHeaders } from '../shared/headers'
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

const evlogPlugin: FastifyPluginCallback<EvlogFastifyOptions> = (fastify, options, done) => {
  const emitted = new WeakSet<object>()
  const requestState = new WeakMap<object, RequestState>()

  fastify.addHook('onRequest', (request, _reply, done) => {
    const headers = extractSafeNodeHeaders(request.headers)
    const path = new URL(request.url, 'http://localhost').pathname

    const { logger, finish, skipped } = createMiddlewareLogger({
      method: request.method,
      path,
      requestId: headers['x-request-id'] || crypto.randomUUID(),
      headers,
      ...options,
    })

    if (skipped) {
      done()
      return
    }

    // Shadow Fastify's built-in pino logger with evlog's request-scoped logger
    const req = request as any
    req.log = logger
    requestState.set(request, { finish })

    storage.run(logger, () => done())
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

// Break Fastify plugin encapsulation without a runtime dependency on fastify-plugin.
// This is the same mechanism fastify-plugin uses internally.
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
