import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RequestLogger } from '../src/types'

const mockStorageRun = vi.hoisted(() => vi.fn())

vi.mock('../src/shared/storage', () => ({
  createLoggerStorage: () => ({
    storage: { run: mockStorageRun },
    useLogger: vi.fn(),
  }),
}))

import { createEvlogMiddleware, createEvlogContext } from '../src/orpc/index'

describe('evlog/orpc', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('createEvlogMiddleware', () => {
    it('procedure exitoso — llama log.set con procedure e input, no llama log.error', async () => {
      const mockLog = { set: vi.fn(), error: vi.fn() } as unknown as RequestLogger
      mockStorageRun.mockImplementation((_log: unknown, fn: () => unknown) => fn())

      const middleware = createEvlogMiddleware()
      const input = { id: 1 }
      await middleware(
        { context: { log: mockLog }, path: ['user', 'getById'], next: async () => ({ id: 1, name: 'test' }) },
        input,
        undefined,
      )

      expect(mockLog.set).toHaveBeenCalledWith({ procedure: 'user.getById', input })
      expect(mockLog.error).not.toHaveBeenCalled()
    })

    it('procedure con error — llama log.error y re-lanza', async () => {
      const mockLog = { set: vi.fn(), error: vi.fn() } as unknown as RequestLogger
      mockStorageRun.mockImplementation((_log: unknown, fn: () => unknown) => fn())

      const error = new Error('not found')
      const middleware = createEvlogMiddleware()
      await expect(
        middleware(
          {
            context: { log: mockLog },
            path: ['user', 'getById'],
            next: async () => {
              throw error
            },
          },
          { id: 99 },
          undefined,
        ),
      ).rejects.toThrow(error)

      expect(mockLog.error).toHaveBeenCalledWith(error, { procedure: 'user.getById' })
    })

    it('sin HTTP adapter — lanza error que incluye [evlog/orpc]', async () => {
      const middleware = createEvlogMiddleware()
      await expect(
        middleware(
          { context: {}, path: ['user', 'getById'], next: async () => ({}) },
          {},
          undefined,
        ),
      ).rejects.toThrow('[evlog/orpc]')
    })

    it('retorna el resultado de next()', async () => {
      const mockLog = { set: vi.fn(), error: vi.fn() } as unknown as RequestLogger
      mockStorageRun.mockImplementation((_log: unknown, fn: () => unknown) => fn())

      const expected = { id: 42, name: 'Alice' }
      const middleware = createEvlogMiddleware()
      const result = await middleware(
        { context: { log: mockLog }, path: ['user', 'getById'], next: async () => expected },
        { id: 42 },
        undefined,
      )

      expect(result).toBe(expected)
    })
  })

  describe('createEvlogContext', () => {
    it('inyecta log en el context preservando el base', () => {
      const mockLog = { set: vi.fn(), error: vi.fn() } as unknown as RequestLogger

      const result = createEvlogContext({ log: mockLog }, { userId: '42' })

      expect(result).toEqual({ userId: '42', log: mockLog })
    })

    it('sin HTTP adapter — lanza error que incluye [evlog/orpc]', () => {
      expect(() => createEvlogContext({}, {})).toThrow('[evlog/orpc]')
    })
  })
})
