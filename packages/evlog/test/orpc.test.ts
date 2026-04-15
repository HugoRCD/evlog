import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RequestLogger } from '../src/types'

const mockUseLogger = vi.hoisted(() => vi.fn())

vi.mock('../src/shared/storage', () => ({
  createLoggerStorage: () => ({
    storage: {},
    useLogger: mockUseLogger,
  }),
}))

import { createEvlogInterceptor, createEvlogContext } from '../src/orpc/index'

describe('evlog/orpc', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('createEvlogInterceptor', () => {
    it('procedure exitoso — llama log.set con procedure e input, no llama log.error', async () => {
      const mockLog = { set: vi.fn(), error: vi.fn() } as unknown as RequestLogger
      mockUseLogger.mockReturnValue(mockLog)

      const interceptor = createEvlogInterceptor()
      const input = { id: 1 }
      await interceptor({
        path: ['user', 'getById'],
        input,
        next: async () => ({ id: 1, name: 'test' }),
      })

      expect(mockLog.set).toHaveBeenCalledWith({ procedure: 'user.getById', input })
      expect(mockLog.error).not.toHaveBeenCalled()
    })

    it('procedure con error — llama log.error y re-lanza', async () => {
      const mockLog = { set: vi.fn(), error: vi.fn() } as unknown as RequestLogger
      mockUseLogger.mockReturnValue(mockLog)

      const error = new Error('not found')
      const interceptor = createEvlogInterceptor()
      await expect(
        interceptor({
          path: ['user', 'getById'],
          input: { id: 99 },
          next: async () => { throw error },
        }),
      ).rejects.toThrow(error)

      expect(mockLog.error).toHaveBeenCalledWith(error, { procedure: 'user.getById' })
    })

    it('sin HTTP adapter — lanza error que incluye [evlog/orpc]', async () => {
      mockUseLogger.mockImplementation(() => {
        throw new Error('no context')
      })

      const interceptor = createEvlogInterceptor()
      await expect(
        interceptor({
          path: ['user', 'getById'],
          input: {},
          next: async () => ({}),
        }),
      ).rejects.toThrow('[evlog/orpc]')
    })

    it('retorna el resultado de next()', async () => {
      const mockLog = { set: vi.fn(), error: vi.fn() } as unknown as RequestLogger
      mockUseLogger.mockReturnValue(mockLog)

      const expected = { id: 42, name: 'Alice' }
      const interceptor = createEvlogInterceptor()
      const result = await interceptor({
        path: ['user', 'getById'],
        input: { id: 42 },
        next: async () => expected,
      })

      expect(result).toBe(expected)
    })
  })

  describe('createEvlogContext', () => {
    it('inyecta log en el context preservando el base', () => {
      const mockLog = { set: vi.fn(), error: vi.fn() } as unknown as RequestLogger
      mockUseLogger.mockReturnValue(mockLog)

      const result = createEvlogContext(new Request('http://localhost'), { userId: '42' })

      expect(result).toEqual({ userId: '42', log: mockLog })
    })

    it('sin HTTP adapter — lanza error que incluye [evlog/orpc]', () => {
      mockUseLogger.mockImplementation(() => {
        throw new Error('no context')
      })

      expect(() =>
        createEvlogContext(new Request('http://localhost'), {}),
      ).toThrow('[evlog/orpc]')
    })
  })
})
