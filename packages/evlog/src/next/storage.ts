import { AsyncLocalStorage } from 'node:async_hooks'
import type { RequestLogger } from '../types'

export const evlogStorage = new AsyncLocalStorage<RequestLogger>()

/**
 * Get the current request-scoped logger.
 * Must be called inside a `withEvlog()` wrapper.
 *
 * @throws {Error} if called outside of `withEvlog()` context
 *
 * @example
 * ```ts
 * export const POST = withEvlog(async (request) => {
 *   const log = useLogger()
 *   log.set({ user: { id: '123' } })
 *   return Response.json({ ok: true })
 * })
 * ```
 */
export function useLogger<T extends object = Record<string, unknown>>(): RequestLogger<T> {
  const logger = evlogStorage.getStore()
  if (!logger) {
    throw new Error(
      '[evlog] useLogger() was called outside of a withEvlog() context. '
      + 'Wrap your route handler or server action with withEvlog().',
    )
  }
  return logger as RequestLogger<T>
}
