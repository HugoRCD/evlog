import { AsyncLocalStorage } from 'node:async_hooks'
import { Elysia } from 'elysia'
import type { RequestLogger } from '../types'
import { defineFrameworkIntegration } from '../shared/integration'
import type { BaseEvlogOptions } from '../shared/middleware'
import { attachForkToLogger } from '../shared/fork'

const storage = new AsyncLocalStorage<RequestLogger>()

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

interface ElysiaContext {
  request: Request
  path: string
  headers: Record<string, string>
}

const integration = defineFrameworkIntegration<ElysiaContext>({
  name: 'elysia',
  extractRequest: ({ request, path, headers }) => ({
    method: request.method,
    path,
    headers,
    requestId: headers['x-request-id'],
  }),
  attachLogger: ({ request, path, headers }, logger) => {
    attachForkToLogger(storage, logger, {
      method: request.method,
      path,
      requestId: headers['x-request-id'],
    }, {
      onChildEnter: (child) => {
        activeLoggers.add(child)
      },
      onChildExit: (child) => {
        activeLoggers.delete(child)
      },
    })
    activeLoggers.add(logger)
  },
})

interface RequestState {
  finish: (opts?: { status?: number; error?: Error }) => Promise<unknown>
  skipped: boolean
  logger: RequestLogger
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
export function evlog(options: EvlogElysiaOptions = {}) {
  const emitted = new WeakSet<Request>()
  const requestState = new WeakMap<Request, RequestState>()

  return new Elysia({ name: 'evlog' })
    .derive({ as: 'global' }, ({ request, path, headers }) => {
      const ctx: ElysiaContext = { request, path, headers: headers as Record<string, string> }
      const { logger, finish, skipped } = integration.start(ctx, options)
      storage.enterWith(logger)
      requestState.set(request, { finish, skipped, logger })
      return { log: logger }
    })
    .onAfterResponse({ as: 'global' }, async ({ request, set }) => {
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
