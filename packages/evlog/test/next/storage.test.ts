import { AsyncLocalStorage } from 'node:async_hooks'
import { describe, expect, it } from 'vitest'
import type { RequestLogger } from '../../src/types'
import { defined } from '../helpers/defined'
import { evlogStorage, useLogger } from '../../src/next/storage'

function createMockLogger(overrides: Partial<RequestLogger & { id?: number }> = {}): RequestLogger {
  return {
    set: () => {},
    setLevel: () => {},
    error: () => {},
    info: () => {},
    warn: () => {},
    emit: () => null,
    getContext: () => ({}),
    ...overrides,
  }
}

describe('evlogStorage', () => {
  it('is an AsyncLocalStorage instance', () => {
    expect(evlogStorage).toBeInstanceOf(AsyncLocalStorage)
  })

  it('returns undefined outside of a run context', () => {
    expect(evlogStorage.getStore()).toBeUndefined()
  })

  it('stores and retrieves a logger inside a run context', () => {
    const mockLogger = createMockLogger()

    evlogStorage.run(mockLogger, () => {
      expect(evlogStorage.getStore()).toBe(mockLogger)
    })
  })

  it('isolates stores across concurrent runs', async () => {
    const logger1 = createMockLogger({ id: 1 })
    const logger2 = createMockLogger({ id: 2 })

    const results: number[] = []

    await Promise.all([
      new Promise<void>((resolve) => {
        evlogStorage.run(logger1, () => {
          const store = defined(evlogStorage.getStore(), 'logger1 store') as RequestLogger & { id?: number }
          results.push(defined(store.id, 'logger1 id'))
          resolve()
        })
      }),
      new Promise<void>((resolve) => {
        evlogStorage.run(logger2, () => {
          const store = defined(evlogStorage.getStore(), 'logger2 store') as RequestLogger & { id?: number }
          results.push(defined(store.id, 'logger2 id'))
          resolve()
        })
      }),
    ])

    expect(results).toContain(1)
    expect(results).toContain(2)
  })
})

describe('useLogger', () => {
  it('throws when called outside of withEvlog context', () => {
    expect(() => useLogger()).toThrow('[evlog] useLogger() was called outside of a withEvlog() context')
  })

  it('returns the logger from the current AsyncLocalStorage context', () => {
    const mockLogger = createMockLogger()

    evlogStorage.run(mockLogger, () => {
      const logger = useLogger()
      expect(logger).toBe(mockLogger)
    })
  })
})
