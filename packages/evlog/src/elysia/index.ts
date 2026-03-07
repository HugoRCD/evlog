import { AsyncLocalStorage } from 'node:async_hooks'
import { Elysia } from 'elysia'
import type { DrainContext, EnrichContext, RequestLogger, RouteConfig, TailSamplingContext } from '../types'
import { createMiddlewareLogger } from '../shared/middleware'
import { extractSafeHeaders } from '../shared/headers'

const storage = new AsyncLocalStorage<RequestLogger>()

export interface EvlogElysiaOptions {
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

/**
 * Get the request-scoped logger from anywhere in the call stack.
 * Must be called inside a request handled by the `evlog()` plugin.
 *
 * @example
 * ```ts
 * import { useLogger } from 'evlog/elysia'
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
      + 'Make sure app.use(evlog()) is registered before your routes.',
    )
  }
  return logger as RequestLogger<T>
}

/**
 * Create an evlog plugin for Elysia.
 *
 * @example
 * ```ts
 * import { Elysia } from 'elysia'
 * import { evlog } from 'evlog/elysia'
 * import { createAxiomDrain } from 'evlog/axiom'
 *
 * const app = new Elysia()
 *   .use(evlog({
 *     drain: createAxiomDrain(),
 *     enrich: (ctx) => {
 *       ctx.event.region = process.env.FLY_REGION
 *     },
 *   }))
 *   .get('/health', ({ log }) => {
 *     log.set({ route: 'health' })
 *     return { ok: true }
 *   })
 *   .listen(3000)
 * ```
 */
interface RequestState {
  finish: (opts?: { status?: number; error?: Error }) => Promise<unknown>
  skipped: boolean
}

export function evlog(options: EvlogElysiaOptions = {}) {
  const emitted = new WeakSet<Request>()
  const requestState = new WeakMap<Request, RequestState>()

  return new Elysia({ name: 'evlog' })
    .derive({ as: 'global' }, ({ request }) => {
      const url = new URL(request.url)

      const { logger, finish, skipped } = createMiddlewareLogger({
        method: request.method,
        path: url.pathname,
        requestId: request.headers.get('x-request-id') || crypto.randomUUID(),
        headers: extractSafeHeaders(request.headers),
        ...options,
      })

      storage.enterWith(logger)
      requestState.set(request, { finish, skipped })

      return { log: logger }
    })
    .onAfterHandle({ as: 'global' }, async ({ request, set }) => {
      const state = requestState.get(request)
      if (!state || state.skipped || emitted.has(request)) return
      emitted.add(request)
      await state.finish({ status: set.status as number || 200 })
      storage.enterWith(undefined as unknown as RequestLogger)
    })
    .onError({ as: 'global' }, async ({ request, error }) => {
      const state = requestState.get(request)
      if (!state || state.skipped || emitted.has(request)) return
      emitted.add(request)
      const logger = storage.getStore()
      const err = error instanceof Error ? error : new Error(String(error))
      if (logger) logger.error(err)
      await state.finish({ error: err })
      storage.enterWith(undefined as unknown as RequestLogger)
    })
}
