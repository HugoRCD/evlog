import { AsyncLocalStorage } from 'node:async_hooks'
import type { AuditableLogger } from '../audit'

/**
 * Create a request-scoped `AsyncLocalStorage` and matching `useLogger`
 * accessor. Every framework that exposes `useLogger()` (Express, Fastify,
 * NestJS, SvelteKit) calls this once at module level.
 *
 * Prefer `import { createLoggerStorage } from 'evlog/toolkit/storage'` on
 * Cloudflare Workers / edge so `node:async_hooks` is not pulled through the
 * main `evlog/toolkit` barrel. The barrel still re-exports this helper for
 * compatibility — remove that re-export at the next major (#403).
 *
 * @param contextHint - Appended to the error message when `useLogger()` is
 *   called outside of a request, e.g. `"middleware context. Make sure
 *   app.use(evlog()) is registered before your routes."`.
 */
export function createLoggerStorage(contextHint: string) {
  const storage = new AsyncLocalStorage<AuditableLogger>()

  function useLogger<T extends object = Record<string, unknown>>(): AuditableLogger<T> {
    const logger = storage.getStore()
    if (!logger) {
      throw new Error(
        `[evlog] useLogger() was called outside of an evlog ${contextHint}`,
      )
    }
    /** @internal ALS store is untyped; cast satisfies the caller's generic `T`. */
    return logger as AuditableLogger<T>
  }

  return { storage, useLogger }
}
