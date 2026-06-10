import { afterEach, describe, expect, it, vi } from 'vitest'
import { installFlushOnExit, resetFlushOnExitForTests, resolveFlushFn } from '../src/flush'

describe('flush', () => {
  afterEach(() => {
    resetFlushOnExitForTests()
  })

  describe('resolveFlushFn', () => {
    it('returns flush from pipeline-style function drains', async () => {
      const flush = vi.fn(async () => {})
      const drain = Object.assign(() => {}, { flush })

      const run = resolveFlushFn(drain)
      expect(run).toBeTypeOf('function')
      await run!()
      expect(flush).toHaveBeenCalledOnce()
    })

    it('returns flush from object drains that expose flush()', async () => {
      const flush = vi.fn(async () => {})
      const drain = { flush }

      const run = resolveFlushFn(drain)
      await run!()
      expect(flush).toHaveBeenCalledOnce()
    })

    it('returns undefined when no flush method exists', () => {
      expect(resolveFlushFn(() => {})).toBeUndefined()
      expect(resolveFlushFn({})).toBeUndefined()
    })
  })

  describe('resetFlushOnExitForTests', () => {
    it('removes beforeExit listeners installed by installFlushOnExit', () => {
      const flush = vi.fn(async () => {})
      const beforeCount = process.listenerCount('beforeExit')

      installFlushOnExit(flush)
      expect(process.listenerCount('beforeExit')).toBe(beforeCount + 1)

      resetFlushOnExitForTests()
      expect(process.listenerCount('beforeExit')).toBe(beforeCount)
    })
  })
})
