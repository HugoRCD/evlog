import { AsyncLocalStorage } from 'node:async_hooks'
import { beforeEach, describe, expect, it } from 'vitest'
import { Elysia } from 'elysia'
import { initLogger } from '../../src/logger'
import {
  installAsyncLocalStorageEnterWithPolyfill,
  patchAsyncLocalStorageEnterWith,
  supportsAsyncLocalStorageEnterWith,
} from '../../src/shared/asyncStorageScope'
import { evlog } from '../../src/elysia/index'
import {
  createPipelineSpies,
  findEventViaDrain,
  waitForDrainCalls,
} from '../helpers/framework'

function createWorkersLikeStorage<T = unknown>(): AsyncLocalStorage<T> {
  class LocalAsyncLocalStorage extends AsyncLocalStorage<T> {}
  Object.defineProperty(LocalAsyncLocalStorage.prototype, 'enterWith', {
    configurable: true,
    writable: true,
    value: undefined,
  })
  patchAsyncLocalStorageEnterWith(
    LocalAsyncLocalStorage.prototype as Parameters<typeof patchAsyncLocalStorageEnterWith>[0],
  )
  return new LocalAsyncLocalStorage()
}

function delay(ms = 1) {
  return new Promise((resolve) => {
    setImmediate(resolve)
  })
}

async function request(app: { handle: (req: Request) => Promise<Response> }, path: string) {
  const response = await app.handle(new Request(`http://localhost${path}`))
  await delay()
  return response
}

describe('asyncStorageScope', () => {
  it('detects native enterWith support', () => {
    expect(supportsAsyncLocalStorageEnterWith(new AsyncLocalStorage<string>())).toBe(true)
  })

  it('is a no-op when enterWith already exists', () => {
    const before = AsyncLocalStorage.prototype.getStore

    installAsyncLocalStorageEnterWithPolyfill()

    expect(typeof AsyncLocalStorage.prototype.enterWith).toBe('function')
    expect(AsyncLocalStorage.prototype.getStore).toBe(before)
  })

  it('polyfills enterWith for runtimes that omit it', async () => {
    const storage = createWorkersLikeStorage<string>()

    storage.enterWith('request-logger')
    expect(storage.getStore()).toBe('request-logger')

    await Promise.resolve()
    expect(storage.getStore()).toBe('request-logger')

    storage.enterWith(undefined as unknown as string)
    expect(storage.getStore()).toBeUndefined()
  })

  it('supports elysia-style request scope usage (#394)', async () => {
    const storage = createWorkersLikeStorage<object>()
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

describe('evlog/elysia workers concurrency', () => {
  beforeEach(() => {
    initLogger({
      env: { service: 'elysia-test' },
      pretty: false,
    })
  })

  it('keeps derive log isolated across interleaved requests without enterWith (#394)', async () => {
    const { drain } = createPipelineSpies()
    const contexts: Record<string, string | undefined> = {
      a: undefined,
      b: undefined,
    }

    const app = new Elysia()
      .use(evlog({ drain }))
      .get('/api/a', async ({ log }) => {
        log.set({ route: 'a' })
        await Promise.resolve()
        contexts.a = log.getContext().route as string | undefined
        return { ok: true }
      })
      .get('/api/b', ({ log }) => {
        log.set({ route: 'b' })
        contexts.b = log.getContext().route as string | undefined
        return { ok: true }
      })

    await Promise.all([
      request(app, '/api/a'),
      request(app, '/api/b'),
    ])
    await waitForDrainCalls(drain, 2)

    expect(contexts.a).toBe('a')
    expect(contexts.b).toBe('b')
    expect(findEventViaDrain(drain, event => event.route === 'a')).toBeDefined()
    expect(findEventViaDrain(drain, event => event.route === 'b')).toBeDefined()
  })
})
