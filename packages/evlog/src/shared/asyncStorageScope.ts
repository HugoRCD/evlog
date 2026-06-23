import { AsyncLocalStorage } from 'node:async_hooks'

type AsyncLocalStorageLike = {
  getStore(): unknown
  run(
    store: unknown,
    callback: (...args: unknown[]) => unknown,
    ...args: unknown[]
  ): unknown
  enterWith?(store: unknown): void
}

type AsyncLocalStorageInstance = object

type BoundGetStore = (this: AsyncLocalStorageInstance) => unknown
type BoundRun = (
  this: AsyncLocalStorageInstance,
  store: unknown,
  callback: (...args: unknown[]) => unknown,
  ...args: unknown[]
) => unknown

/**
 * Polyfill `enterWith()` on a single AsyncLocalStorage prototype. Used by
 * {@link installAsyncLocalStorageEnterWithPolyfill} and unit tests via a subclass
 * so global `AsyncLocalStorage` is never mutated in parallel test workers.
 */
export function patchAsyncLocalStorageEnterWith(prototype: AsyncLocalStorageLike): void {
  if (typeof prototype.enterWith === 'function') return

  const fallbackStores = new WeakMap<AsyncLocalStorageInstance, unknown>()
  const runDepth = new WeakMap<AsyncLocalStorageInstance, number>()
  const originalGetStore = prototype.getStore as BoundGetStore
  const originalRun = prototype.run as BoundRun

  Object.defineProperty(prototype, 'enterWith', {
    configurable: true,
    writable: true,
    value(this: AsyncLocalStorageInstance, store: unknown): void {
      fallbackStores.set(this, store)
    },
  })

  Object.defineProperty(prototype, 'run', {
    configurable: true,
    writable: true,
    value(
      this: AsyncLocalStorageInstance,
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
    value(this: AsyncLocalStorageInstance): unknown {
      const active = originalGetStore.call(this)
      if ((runDepth.get(this) ?? 0) > 0) return active
      return active !== undefined ? active : fallbackStores.get(this)
    },
  })
}

/**
 * Polyfill `AsyncLocalStorage.enterWith()` on runtimes that omit it (Cloudflare Workers).
 *
 * Elysia's lifecycle is split across hooks (`onRequest` → handler → `onAfterResponse`), so
 * the integration relies on `enterWith()` to keep `useLogger()` working across `await`
 * boundaries. Workers only expose `run()` / `getStore()`, which this maps onto a fallback
 * store when no `run()` frame is active.
 *
 * Same concurrency semantics as native `enterWith()` — one store per ALS instance between
 * paired `enterWith(logger)` / `enterWith(undefined)` calls on a single request.
 */
export function installAsyncLocalStorageEnterWithPolyfill(): void {
  patchAsyncLocalStorageEnterWith(AsyncLocalStorage.prototype as AsyncLocalStorageLike)
}
