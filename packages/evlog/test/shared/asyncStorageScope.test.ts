import { AsyncLocalStorage } from 'node:async_hooks'
import { afterEach, describe, expect, it } from 'vitest'
import { installAsyncLocalStorageEnterWithPolyfill } from '../../src/shared/asyncStorageScope'

const nativeEnterWith = AsyncLocalStorage.prototype.enterWith
const nativeGetStore = AsyncLocalStorage.prototype.getStore
const nativeRun = AsyncLocalStorage.prototype.run

describe('installAsyncLocalStorageEnterWithPolyfill', () => {
  afterEach(() => {
    AsyncLocalStorage.prototype.enterWith = nativeEnterWith
    AsyncLocalStorage.prototype.getStore = nativeGetStore
    AsyncLocalStorage.prototype.run = nativeRun
  })

  it('is a no-op when enterWith already exists', () => {
    installAsyncLocalStorageEnterWithPolyfill()

    expect(AsyncLocalStorage.prototype.enterWith).toBe(nativeEnterWith)
  })

  it('polyfills enterWith for runtimes that omit it', async () => {
    const storage = new AsyncLocalStorage<string>()
    Object.defineProperty(AsyncLocalStorage.prototype, 'enterWith', {
      configurable: true,
      value: undefined,
    })

    installAsyncLocalStorageEnterWithPolyfill()

    storage.enterWith('request-logger')
    expect(storage.getStore()).toBe('request-logger')

    await Promise.resolve()
    expect(storage.getStore()).toBe('request-logger')

    storage.enterWith(undefined as unknown as string)
    expect(storage.getStore()).toBeUndefined()
  })
})
