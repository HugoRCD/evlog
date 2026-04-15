import type { RequestLogger } from '../types'
import { createLoggerStorage } from '../shared/storage'

const CONTEXT_ERROR = `[evlog/orpc] useLogger() was called outside of an evlog request context.
Make sure an evlog HTTP adapter (evlog/next, evlog/hono, etc.)
is set up before using createEvlogInterceptor().`

const { useLogger } = createLoggerStorage(
  'oRPC interceptor context. Make sure an evlog HTTP adapter is set up before your routes.',
)

export { useLogger }

/**
 * oRPC interceptor factory for evlog. Use in the `interceptors` array of `RPCHandler`.
 *
 * @example
 * ```ts
 * import { createEvlogInterceptor } from 'evlog/orpc'
 *
 * const handler = new RPCHandler(router, {
 *   interceptors: [createEvlogInterceptor()],
 * })
 * ```
 */
export function createEvlogInterceptor() {
  return async ({ next, path, input }: { next: () => Promise<unknown>; path: string[]; input: unknown }): Promise<unknown> => {
    let log: RequestLogger
    try {
      log = useLogger()
    } catch {
      throw new Error(CONTEXT_ERROR)
    }

    log.set({ procedure: path.join('.'), input })

    try {
      const result = await next()
      return result
    } catch (error) {
      log.error(error, { procedure: path.join('.') })
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
 * const handler = new RPCHandler(router, {
 *   context: (request) => createEvlogContext(request, { userId: '123' }),
 * })
 * ```
 */
export function createEvlogContext<TBase extends object>(
  _request: Request,
  baseContext: TBase,
): TBase & { log: RequestLogger } {
  let log: RequestLogger
  try {
    log = useLogger()
  } catch {
    throw new Error(CONTEXT_ERROR)
  }

  return { ...baseContext, log }
}
