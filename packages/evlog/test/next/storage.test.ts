import { AsyncLocalStorage } from 'node:async_hooks'
import { describe, expect, it } from 'vitest'
import { evlogStorage, useLogger } from '../../src/next/storage'

describe('evlogStorage', () => {
  it('is an AsyncLocalStorage instance', () => {
    expect(evlogStorage).toBeInstanceOf(AsyncLocalStorage)
  })

  it('returns undefined outside of a run context', () => {
    expect(evlogStorage.getStore()).toBeUndefined()
  })

  it('stores and retrieves a logger inside a run context', () => {
    const mockLogger = {
      set: () => {},
      error: () => {},
      info: () => {},
      warn: () => {},
      emit: () => null,
      getContext: () => ({}),
    }

    evlogStorage.run(mockLogger, () => {
      expect(evlogStorage.getStore()).toBe(mockLogger)
    })
  })

  it('isolates stores across concurrent runs', async () => {
    const logger1 = { id: 1, set: () => {}, error: () => {}, info: () => {}, warn: () => {}, emit: () => null, getContext: () => ({}) }
    const logger2 = { id: 2, set: () => {}, error: () => {}, info: () => {}, warn: () => {}, emit: () => null, getContext: () => ({}) }

    const results: number[] = []

    await Promise.all([
      new Promise<void>((resolve) => {
        evlogStorage.run(logger1 as any, () => {
          results.push((evlogStorage.getStore() as any).id)
          resolve()
        })
      }),
      new Promise<void>((resolve) => {
        evlogStorage.run(logger2 as any, () => {
          results.push((evlogStorage.getStore() as any).id)
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
    const mockLogger = {
      set: () => {},
      error: () => {},
      info: () => {},
      warn: () => {},
      emit: () => null,
      getContext: () => ({}),
    }

    evlogStorage.run(mockLogger, () => {
      const logger = useLogger()
      expect(logger).toBe(mockLogger)
    })
  })
})
