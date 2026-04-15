import type { RequestLogger } from '../types'
import { createLoggerStorage } from '../shared/storage'

const CONTEXT_ERROR = `[evlog/orpc] useLogger() was called outside of an evlog request context.
Make sure an evlog HTTP adapter (evlog/next, evlog/express, evlog/hono, etc.)
is set up before using createEvlogMiddleware().`

const { storage, useLogger } = createLoggerStorage(
  'oRPC middleware context. Make sure an evlog HTTP adapter is set up before your routes.',
)

export { useLogger }

/**
 * oRPC middleware factory for evlog. Use with `.use()` on a base procedure.
 *
 * @example
 * ```ts
 * import { os } from '@orpc/server'
 * import { createEvlogMiddleware } from 'evlog/orpc'
 *
 * const base = os.$context<Context>().use(createEvlogMiddleware())
 * ```
 */
export function createEvlogMiddleware() {
  return async (opts: any, input: unknown, output: any): Promise<any> => {
    const log: RequestLogger | undefined = opts.context?.log
    if (!log) {
      throw new Error(CONTEXT_ERROR)
    }

    log.set({ procedure: opts.path.join('.'), input })

    try {
      return await storage.run(log, () => opts.next())
    } catch (error) {
      log.error(error as string | Error, { procedure: opts.path.join('.') })
      throw error
    }
  }
}

/**
 * Injects `log` into an oRPC context object.
 *
 * @example
 * ```ts
 * import { createEvlogContext } from 'evlog/orpc'
 *
 * app.use('/rpc', async (req, res) => {
 *   await handler.handle(req, res, {
 *     prefix: '/rpc',
 *     context: createEvlogContext(req, { role: 'user' }),
 *   })
 * })
 * ```
 */
export function createEvlogContext<TBase extends object>(
   
  req: any,
  baseContext: TBase,
): TBase & { log: RequestLogger } {
  // Read logger from the HTTP adapter's request object (req.log set by evlog/express, evlog/fastify, etc.)
  const log: RequestLogger | undefined = req?.log
  if (!log) {
    throw new Error(CONTEXT_ERROR)
  }

  return { ...baseContext, log }
}
