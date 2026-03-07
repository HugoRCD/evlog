import { AsyncLocalStorage } from 'node:async_hooks'
import type { FastifyPluginCallback } from 'fastify'
import type { DrainContext, EnrichContext, RequestLogger, RouteConfig, TailSamplingContext } from '../types'
import { createMiddlewareLogger } from '../shared/middleware'
import { extractSafeNodeHeaders } from '../shared/headers'

const storage = new AsyncLocalStorage<RequestLogger>()

export interface EvlogFastifyOptions {
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

declare module 'fastify' {
  interface FastifyRequest {
    // Overrides Fastify's built-in pino logger on the request with evlog's RequestLogger.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    log: any
  }
}

/**
 * Get the request-scoped logger from anywhere in the call stack.
 * Must be called inside a request handled by the `evlog` plugin.
 *
 * @example
 * ```ts
 * import { useLogger } from 'evlog/fastify'
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
      '[evlog] useLogger() was called outside of an evlog plugin context. '
      + 'Make sure app.register(evlog) is called before your routes.',
    )
  }
  return logger as RequestLogger<T>
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
    ;(request as any).log = logger
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
    const logger = storage.getStore()
    const err = error instanceof Error ? error : new Error(String(error))
    if (logger) logger.error(err)
    await state.finish({ error: err })
  })

  done()
}

// Break Fastify plugin encapsulation without a runtime dependency on fastify-plugin.
// This is the same mechanism fastify-plugin uses internally.
;(evlogPlugin as any)[Symbol.for('skip-override')] = true
;(evlogPlugin as any)[Symbol.for('fastify.display-name')] = 'evlog'

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
