import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RequestLogger } from '../src/types'
import { createEvlogMiddleware, createEvlogContext } from '../src/orpc/index'

const mockStorageRun = vi.hoisted(() => vi.fn())

vi.mock('../src/shared/storage', () => ({
  createLoggerStorage: () => ({
    storage: { run: mockStorageRun },
    useLogger: vi.fn(),
  }),
}))


describe('evlog/orpc', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('createEvlogMiddleware', () => {
    it('successful procedure — calls log.set with procedure and input, does not call log.error', async () => {
      const mockLog = { set: vi.fn(), error: vi.fn() } as unknown as RequestLogger
      mockStorageRun.mockImplementation((_log: unknown, fn: () => unknown) => fn())

      const middleware = createEvlogMiddleware()
      const input = { id: 1 }
      await middleware(
        { context: { log: mockLog }, path: ['user', 'getById'], next: () => ({ id: 1, name: 'test' }) },
        input,
        undefined,
      )

      expect(mockLog.set).toHaveBeenCalledWith({ procedure: 'user.getById', input })
      expect(mockLog.error).not.toHaveBeenCalled()
    })

    it('procedure with error — calls log.error and re-throws', async () => {
      const mockLog = { set: vi.fn(), error: vi.fn() } as unknown as RequestLogger
      mockStorageRun.mockImplementation((_log: unknown, fn: () => unknown) => fn())

      const error = new Error('not found')
      const middleware = createEvlogMiddleware()
      await expect(
        middleware(
          {
            context: { log: mockLog },
            path: ['user', 'getById'],
            next: () => {
              throw error
            },
          },
          { id: 99 },
          undefined,
        ),
      ).rejects.toThrow(error)

      expect(mockLog.error).toHaveBeenCalledWith(error, { procedure: 'user.getById' })
    })

    it('without HTTP adapter — throws error that includes [evlog/orpc]', async () => {
      const middleware = createEvlogMiddleware()
      await expect(
        middleware(
          { context: {}, path: ['user', 'getById'], next: () => ({}) },
          {},
          undefined,
        ),
      ).rejects.toThrow('[evlog/orpc]')
    })

    it('returns the result of next()', async () => {
      const mockLog = { set: vi.fn(), error: vi.fn() } as unknown as RequestLogger
      mockStorageRun.mockImplementation((_log: unknown, fn: () => unknown) => fn())

      const expected = { id: 42, name: 'Alice' }
      const middleware = createEvlogMiddleware()
      const result = await middleware(
        { context: { log: mockLog }, path: ['user', 'getById'], next: () => expected },
        { id: 42 },
        undefined,
      )

      expect(result).toBe(expected)
    })
  })

  describe('createEvlogContext', () => {
    it('injects log into the context preserving the base', () => {
      const mockLog = { set: vi.fn(), error: vi.fn() } as unknown as RequestLogger

      const result = createEvlogContext({ log: mockLog }, { userId: '42' })

      expect(result).toEqual({ userId: '42', log: mockLog })
    })

    it('without HTTP adapter — throws error that includes [evlog/orpc]', () => {
      expect(() => createEvlogContext({}, {})).toThrow('[evlog/orpc]')
    })
  })
})
