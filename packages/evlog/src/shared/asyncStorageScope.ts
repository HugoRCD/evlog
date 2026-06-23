import { AsyncLocalStorage } from 'node:async_hooks'

type AsyncLocalStoragePrototype = Pick<AsyncLocalStorage<unknown>, 'getStore' | 'run'> & {
  enterWith?: (store: unknown) => void
}

/**
 * Polyfill `enterWith()` on a single AsyncLocalStorage prototype. Used by
 * {@link installAsyncLocalStorageEnterWithPolyfill} and unit tests via a subclass
 * so global `AsyncLocalStorage` is never mutated in parallel test workers.
 */
export function patchAsyncLocalStorageEnterWith(prototype: AsyncLocalStoragePrototype): void {
  if (typeof prototype.enterWith === 'function') return

  const fallbackStores = new WeakMap<AsyncLocalStorage<unknown>, unknown>()
  const runDepth = new WeakMap<AsyncLocalStorage<unknown>, number>()
  const originalGetStore = prototype.getStore
  const originalRun = prototype.run

  Object.defineProperty(prototype, 'enterWith', {
    configurable: true,
    writable: true,
    value: function enterWith(this: AsyncLocalStorage<unknown>, store: unknown) {
      fallbackStores.set(this, store)
    },
  })

  Object.defineProperty(prototype, 'run', {
    configurable: true,
    writable: true,
    value: function run(this: AsyncLocalStorage<unknown>, store, callback, ...args) {
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
    value: function getStore(this: AsyncLocalStorage<unknown>) {
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
  patchAsyncLocalStorageEnterWith(AsyncLocalStorage.prototype)
}
