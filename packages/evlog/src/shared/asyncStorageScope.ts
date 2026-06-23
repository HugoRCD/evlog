import { AsyncLocalStorage } from 'node:async_hooks'

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
  if (typeof AsyncLocalStorage.prototype.enterWith === 'function') return

  const fallbackStores = new WeakMap<AsyncLocalStorage<unknown>, unknown>()
  const runDepth = new WeakMap<AsyncLocalStorage<unknown>, number>()
  const originalGetStore = AsyncLocalStorage.prototype.getStore
  const originalRun = AsyncLocalStorage.prototype.run

  AsyncLocalStorage.prototype.enterWith = function enterWith(store: unknown) {
    fallbackStores.set(this, store)
  }

  AsyncLocalStorage.prototype.run = function run(store, callback, ...args) {
    runDepth.set(this, (runDepth.get(this) ?? 0) + 1)
    try {
      return originalRun.call(this, store, callback, ...args)
    } finally {
      const depth = (runDepth.get(this) ?? 1) - 1
      if (depth <= 0) runDepth.delete(this)
      else runDepth.set(this, depth)
    }
  }

  AsyncLocalStorage.prototype.getStore = function getStore() {
    const active = originalGetStore.call(this)
    if ((runDepth.get(this) ?? 0) > 0) return active
    return active !== undefined ? active : fallbackStores.get(this)
  }
}
