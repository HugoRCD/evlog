import type { RequestLogger } from '../types'
import { createRequestLogger } from '../logger'
import { formatDuration } from '../utils'
import { createLoggerStorage } from '../shared/storage'

const CONTEXT_ERROR = `[evlog/trpc] useLogger() was called outside of an evlog request context.
Make sure an evlog HTTP adapter (evlog/next, evlog/express, evlog/hono, etc.)
is set up before using createEvlogMiddleware().`

const { storage, useLogger } = createLoggerStorage(
  'tRPC middleware context. Make sure an evlog HTTP adapter is set up before your routes.',
)

export { useLogger }

/**
 * tRPC middleware factory for evlog. Use with `.use()` on a procedure base.
 *
 * @example
 * ```ts
 * import { createEvlogMiddleware } from 'evlog/trpc'
 *
 * const t = initTRPC.create()
 * const procedure = t.procedure.use(createEvlogMiddleware())
 * ```
 */
export function createEvlogMiddleware() {
  return async (opts: any): Promise<any> => {
    const log: RequestLogger | undefined = opts.ctx?.log
    if (!log) {
      throw new Error(CONTEXT_ERROR)
    }

    const parentContext = log.getContext()
    const isBatched = String(parentContext.path ?? '').split('/').pop()?.includes(',') ?? false

    if (!isBatched) {
      // Single procedure: set context at root level on the HTTP logger (original behavior)
      log.set({ procedure: opts.path, type: opts.type })
      const start = Date.now()
      try {
        const result = await storage.run(log, () => opts.next())
        const duration = formatDuration(Date.now() - start)
        if (!result.ok) {
          log.error(result.error, { procedure: opts.path })
        }
        log.set({ ok: result.ok, duration })
        return result
      } catch (err: unknown) {
        log.error(err instanceof Error ? err : new Error(String(err)), { procedure: opts.path })
        log.set({ ok: false, duration: formatDuration(Date.now() - start) })
        throw err
      }
    }

    // Batch: create an isolated logger per procedure, accumulate into procedures[]
    const procedureLog = createRequestLogger(
      {
        method: parentContext.method as string,
        path: parentContext.path as string,
        requestId: parentContext.requestId as string,
      },
      { _deferDrain: true },
    )
    procedureLog.set({ procedure: opts.path, type: opts.type })

    const start = Date.now()
    try {
      const result = await storage.run(procedureLog, () => opts.next())
      const duration = formatDuration(Date.now() - start)

      if (!result.ok) {
        procedureLog.error(result.error, { procedure: opts.path })
      }
      procedureLog.set({ ok: result.ok, duration })
      return result
    } catch (err: unknown) {
      procedureLog.error(err instanceof Error ? err : new Error(String(err)), { procedure: opts.path })
      procedureLog.set({ ok: false, duration: formatDuration(Date.now() - start) })
      throw err
    } finally {
      const { method: _m, path: _p, requestId: _r, ...procedureCtx } = procedureLog.getContext() as Record<string, unknown>
      const existing = (log.getContext().procedures as Record<string, unknown> | undefined) ?? {}
      log.set({ procedures: { ...existing, [opts.path]: procedureCtx } } as Record<string, unknown>)
    }
  }
}

/**
 * Wrapper for tRPC `createContext`. Runs user factory then injects `log` into context.
 *
 * @example
 * ```ts
 * import { createEvlogTRPCContext } from 'evlog/trpc'
 *
 * export const createContext = createEvlogTRPCContext(async ({ req }) => ({
 *   userId: req.headers.get('x-user-id'),
 * }))
 * ```
 */
export function createEvlogTRPCContext<TBase extends object>(
   
  factory: (opts: any) => Promise<TBase> | TBase,
) {
  return async (opts: any): Promise<TBase & { log: RequestLogger }> => {
    const base = await factory(opts)

    // Read logger from the HTTP adapter's request object (req.log set by evlog/express, evlog/fastify, etc.)
    const log: RequestLogger | undefined = opts.req?.log
    if (!log) {
      throw new Error(CONTEXT_ERROR)
    }

    return { ...base, log }
  }
}
