import { AsyncLocalStorage } from 'node:async_hooks'
import type { RequestLogger } from '../types'

/**
 * Create a request-scoped `AsyncLocalStorage` and a matching `useLogger` accessor.
 *
 * Every framework that needs `useLogger()` (Express, Fastify, NestJS, SvelteKit)
 * calls this once at module level to get its own isolated storage + accessor pair.
 *
 * @param contextHint - Human-readable hint appended to the error message when
 *   `useLogger()` is called outside of a request (e.g.
 *   `"middleware context. Make sure app.use(evlog()) is registered before your routes."`).
 */
export function createLoggerStorage(contextHint: string) {
  const storage = new AsyncLocalStorage<RequestLogger>()

  /**
   * Access the request-scoped logger created by the evlog middleware.
   *
   * Must be called inside a request that is handled by the evlog middleware.
   * Throws if called outside of a request context.
   *
   * @example
   * ```ts
   * import { useLogger } from 'evlog/express' // or /fastify, /nestjs, /sveltekit, /elysia
   *
   * function myService() {
   *   const log = useLogger()
   *   log.set({ users: { count: 42 } })
   * }
   * ```
   */
  function useLogger<T extends object = Record<string, unknown>>(): RequestLogger<T> {
    const logger = storage.getStore()
    if (!logger) {
      throw new Error(
        `[evlog] useLogger() was called outside of an evlog ${contextHint}`,
      )
    }
    return logger as RequestLogger<T>
  }

  return { storage, useLogger }
}
