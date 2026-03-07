import { AsyncLocalStorage } from 'node:async_hooks'
import { Elysia } from 'elysia'
import type { RequestLogger } from '../types'
import { createMiddlewareLogger, type BaseEvlogOptions } from '../shared/middleware'
import { extractSafeHeaders } from '../shared/headers'

const storage = new AsyncLocalStorage<RequestLogger>()

// Tracks loggers that are currently active (within a live request).
// Elysia uses storage.enterWith() which persists in the async context
// even after the request ends, so we use this set to distinguish
// an in-flight logger from a stale one.
const activeLoggers = new WeakSet<RequestLogger>()

export type EvlogElysiaOptions = BaseEvlogOptions

/**
 * Get the request-scoped logger from anywhere in the call stack.
 * Must be called inside a request handled by the `evlog()` plugin.
 *
 * Unlike other frameworks, Elysia uses `storage.enterWith()` which persists
 * beyond the request lifecycle. This accessor additionally checks `activeLoggers`
 * to ensure the logger belongs to an in-flight request.
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
  if (!logger || !activeLoggers.has(logger)) {
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
  logger: RequestLogger
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

      if (!skipped) activeLoggers.add(logger)
      storage.enterWith(logger)
      requestState.set(request, { finish, skipped, logger })

      return { log: logger }
    })
    .onAfterHandle({ as: 'global' }, async ({ request, set }) => {
      const state = requestState.get(request)
      if (!state || state.skipped || emitted.has(request)) return
      emitted.add(request)
      await state.finish({ status: set.status as number || 200 })
      activeLoggers.delete(state.logger)
      storage.enterWith(undefined as unknown as RequestLogger)
    })
    .onError({ as: 'global' }, async ({ request, error }) => {
      const state = requestState.get(request)
      if (!state || state.skipped || emitted.has(request)) return
      emitted.add(request)
      const err = error instanceof Error ? error : new Error(String(error))
      state.logger.error(err)
      await state.finish({ error: err })
      activeLoggers.delete(state.logger)
      storage.enterWith(undefined as unknown as RequestLogger)
    })
}
