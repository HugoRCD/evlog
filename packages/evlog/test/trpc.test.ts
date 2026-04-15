import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RequestLogger } from '../src/types'

const mockStorageRun = vi.hoisted(() => vi.fn())

vi.mock('../src/shared/storage', () => ({
  createLoggerStorage: () => ({
    storage: { run: mockStorageRun },
    useLogger: vi.fn(),
  }),
}))

import { createEvlogMiddleware, createEvlogTRPCContext } from '../src/trpc/index'

describe('evlog/trpc', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('createEvlogMiddleware', () => {
    it('procedure exitoso — llama log.set con procedure y type, no llama log.error', async () => {
      const mockLog = { set: vi.fn(), error: vi.fn(), getContext: vi.fn(() => ({ path: '/trpc/user.getById' })) } as unknown as RequestLogger
      mockStorageRun.mockImplementation((_log: unknown, fn: () => unknown) => fn())

      const middleware = createEvlogMiddleware()
      await middleware({
        ctx: { log: mockLog },
        path: 'user.getById',
        type: 'query',
        next: async () => ({ ok: true }),
      })

      expect(mockLog.set).toHaveBeenCalledWith({ procedure: 'user.getById', type: 'query' })
      expect(mockLog.error).not.toHaveBeenCalled()
    })

    it('procedure con error — llama log.error con el error', async () => {
      const mockLog = { set: vi.fn(), error: vi.fn(), getContext: vi.fn(() => ({ path: '/trpc/user.getById' })) } as unknown as RequestLogger
      mockStorageRun.mockImplementation((_log: unknown, fn: () => unknown) => fn())

      const error = new Error('not found')
      const middleware = createEvlogMiddleware()
      await middleware({
        ctx: { log: mockLog },
        path: 'user.getById',
        type: 'query',
        next: async () => ({ ok: false, error }),
      })

      expect(mockLog.error).toHaveBeenCalledWith(error, { procedure: 'user.getById' })
    })

    it('sin HTTP adapter — lanza error que incluye [evlog/trpc]', async () => {
      const middleware = createEvlogMiddleware()
      await expect(
        middleware({
          ctx: {},
          path: 'user.getById',
          type: 'query',
          next: async () => ({ ok: true }),
        }),
      ).rejects.toThrow('[evlog/trpc]')
    })
  })

  describe('createEvlogTRPCContext', () => {
    it('inyecta log en el context junto al resultado del factory', async () => {
      const mockLog = { set: vi.fn(), error: vi.fn() } as unknown as RequestLogger

      const factory = () => ({ user: 'test' })
      const createContext = createEvlogTRPCContext(factory)
      const result = await createContext({ req: { log: mockLog } })

      expect(result).toEqual({ user: 'test', log: mockLog })
    })

    it('sin HTTP adapter — lanza error que incluye [evlog/trpc]', async () => {
      const createContext = createEvlogTRPCContext(() => ({}))
      await expect(createContext({ req: {} })).rejects.toThrow('[evlog/trpc]')
    })
  })
})
