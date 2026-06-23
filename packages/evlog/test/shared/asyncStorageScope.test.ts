import { AsyncLocalStorage } from 'node:async_hooks'
import { describe, expect, it } from 'vitest'
import {
  installAsyncLocalStorageEnterWithPolyfill,
  patchAsyncLocalStorageEnterWith,
} from '../../src/shared/asyncStorageScope'

function createWorkersLikeStorage(): AsyncLocalStorage<string> {
  class LocalAsyncLocalStorage extends AsyncLocalStorage<string> {}
  Object.defineProperty(LocalAsyncLocalStorage.prototype, 'enterWith', {
    configurable: true,
    writable: true,
    value: undefined,
  })
  patchAsyncLocalStorageEnterWith(LocalAsyncLocalStorage.prototype)
  return new LocalAsyncLocalStorage()
}

describe('patchAsyncLocalStorageEnterWith', () => {
  it('is a no-op when enterWith already exists', () => {
    const before = AsyncLocalStorage.prototype.getStore

    installAsyncLocalStorageEnterWithPolyfill()

    expect(typeof AsyncLocalStorage.prototype.enterWith).toBe('function')
    expect(AsyncLocalStorage.prototype.getStore).toBe(before)
  })

  it('polyfills enterWith for runtimes that omit it', async () => {
    const storage = createWorkersLikeStorage()

    storage.enterWith('request-logger')
    expect(storage.getStore()).toBe('request-logger')

    await Promise.resolve()
    expect(storage.getStore()).toBe('request-logger')

    storage.enterWith(undefined as unknown as string)
    expect(storage.getStore()).toBeUndefined()
  })

  it('supports elysia-style request scope usage (#394)', async () => {
    const storage = createWorkersLikeStorage()
    const activeLoggers = new WeakSet<object>()

    function bindRequestLogger(logger: object) {
      storage.enterWith(logger)
      activeLoggers.add(logger)
    }

    function useLogger() {
      const logger = storage.getStore()
      if (!logger || !activeLoggers.has(logger)) {
        throw new Error('[evlog] useLogger() was called outside of an evlog plugin context.')
      }
      return logger
    }

    const requestLogger = { id: 'request-logger' }
    bindRequestLogger(requestLogger)
    expect(useLogger()).toBe(requestLogger)
    await Promise.resolve()
    expect(useLogger()).toBe(requestLogger)

    storage.enterWith(undefined as unknown as object)
    activeLoggers.delete(requestLogger)
    expect(() => useLogger()).toThrow('[evlog] useLogger()')
  })
})
