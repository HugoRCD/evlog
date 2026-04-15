import type { RequestLogger } from '../types'
import { createLoggerStorage } from '../shared/storage'

const CONTEXT_ERROR = `[evlog/trpc] useLogger() was called outside of an evlog request context.
Make sure an evlog HTTP adapter (evlog/next, evlog/express, evlog/hono, etc.)
is set up before using createEvlogMiddleware().`

const { useLogger } = createLoggerStorage(
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (opts: any): Promise<any> => {
    let log: RequestLogger
    try {
      log = useLogger()
    } catch {
      throw new Error(CONTEXT_ERROR)
    }

    log.set({ procedure: opts.path, type: opts.type })

    // tRPC middleware result
    const result = await opts.next()

    if (!result.ok) {
      log.error(result.error, { procedure: opts.path })
    }

    return result
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  factory: (opts: any) => Promise<TBase> | TBase,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (opts: any): Promise<TBase & { log: RequestLogger }> => {
    const base = await factory(opts)

    let log: RequestLogger
    try {
      log = useLogger()
    } catch {
      throw new Error(CONTEXT_ERROR)
    }

    return { ...base, log }
  }
}
