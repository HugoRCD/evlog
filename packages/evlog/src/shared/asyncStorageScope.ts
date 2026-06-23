import { AsyncLocalStorage } from 'node:async_hooks'

/** Prototype surface patched by {@link patchAsyncLocalStorageEnterWith}. */
type AsyncLocalStoragePrototype = Pick<
  AsyncLocalStorage<unknown>,
  'getStore' | 'run'
> & {
  enterWith?: unknown
}

/**
 * Whether this runtime implements native `AsyncLocalStorage.enterWith()`.
 * Cloudflare Workers omit it; Node.js and Bun provide it.
 */
export function supportsAsyncLocalStorageEnterWith(
  storage: { enterWith?: unknown },
): boolean {
  return typeof storage.enterWith === 'function'
}

/**
 * Bind `value` to `storage` for the current async execution context.
 * Uses native `enterWith()` when available; otherwise relies on the polyfill
 * installed by {@link installAsyncLocalStorageEnterWithPolyfill}.
 */
export function bindAsyncLocalStorage<T>(
  storage: AsyncLocalStorage<T>,
  value: T,
): void {
  storage.enterWith(value)
}

/** Clear a value previously bound with {@link bindAsyncLocalStorage}. */
export function clearAsyncLocalStorage<T>(storage: AsyncLocalStorage<T>): void {
  storage.enterWith(undefined as unknown as T)
}

/**
 * Polyfill `enterWith()` on a single `AsyncLocalStorage` prototype.
 *
 * Used by {@link installAsyncLocalStorageEnterWithPolyfill} and by unit tests
 * through a dedicated subclass so the global prototype is never mutated in
 * parallel Vitest workers.
 */
export function patchAsyncLocalStorageEnterWith(
  prototype: AsyncLocalStoragePrototype,
): void {
  if (supportsAsyncLocalStorageEnterWith(prototype)) return

  const fallbackStores = new WeakMap<object, unknown>()
  const runDepth = new WeakMap<object, number>()
  const originalGetStore = prototype.getStore
  const originalRun = prototype.run

  Object.defineProperty(prototype, 'enterWith', {
    configurable: true,
    writable: true,
    value(this: object, store: unknown): void {
      fallbackStores.set(this, store)
    },
  })

  Object.defineProperty(prototype, 'run', {
    configurable: true,
    writable: true,
    value(
      this: object,
      store: unknown,
      callback: (...args: unknown[]) => unknown,
      ...args: unknown[]
    ): unknown {
      runDepth.set(this, (runDepth.get(this) ?? 0) + 1)
      try {
        return originalRun.call(this, store, callback, ...args)
      } finally {
        const depth = (runDepth.get(this) ?? 1) - 1
        if (depth <= 0) runDepth.delete(this)
        else runDepth.set(this, depth)
      }
    },
  })

  Object.defineProperty(prototype, 'getStore', {
    configurable: true,
    writable: true,
    value(this: object): unknown {
      const active = originalGetStore.call(this)
      if ((runDepth.get(this) ?? 0) > 0) return active
      return active !== undefined ? active : fallbackStores.get(this)
    },
  })
}

/**
 * Install an `enterWith()` polyfill when the runtime omits it (Cloudflare Workers).
 *
 * Elysia's lifecycle is split across hooks (`onRequest` → handler → `onAfterResponse`).
 * Unlike Express or Fastify, there is no single `next()` boundary to wrap in
 * `storage.run()`, so the integration binds the logger with `enterWith()`.
 *
 * The polyfill stores the value on the ALS instance when no native `run()` frame
 * is active. That matches single-request `wrangler dev` flows and async work
 * spawned from a handler, but it does **not** replicate native per-async-context
 * isolation when multiple requests interleave in the same isolate. Prefer `{ log }`
 * from derive for concurrent Workers handlers.
 */
export function installAsyncLocalStorageEnterWithPolyfill(): void {
  patchAsyncLocalStorageEnterWith(AsyncLocalStorage.prototype)
}
