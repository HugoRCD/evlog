import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RequestLogger } from '../src/types'

const mockStorageRun = vi.hoisted(() => vi.fn())
const mockCreateRequestLogger = vi.hoisted(() => vi.fn())
const mockFormatDuration = vi.hoisted(() => vi.fn((ms: number) => `${ms}ms`))

vi.mock('../src/shared/storage', () => ({
  createLoggerStorage: () => ({
    storage: { run: mockStorageRun },
    useLogger: vi.fn(),
  }),
}))

vi.mock('../src/logger', () => ({
  createRequestLogger: mockCreateRequestLogger,
}))

vi.mock('../src/utils', () => ({
  formatDuration: mockFormatDuration,
}))

import { createEvlogMiddleware, createEvlogTRPCContext } from '../src/trpc/index'

// Logger HTTP mock — rastrea su contexto acumulado para simular set() real
function makeHttpLog(path = '/trpc/user.getById') {
  const ctx: Record<string, unknown> = { path }
  return {
    set: vi.fn((data: Record<string, unknown>) => { Object.assign(ctx, data) }),
    error: vi.fn(),
    getContext: vi.fn(() => ({ ...ctx })),
  } as unknown as RequestLogger
}

// Logger de procedure mock — rastrea contexto propio
function makeProcedureLog() {
  const ctx: Record<string, unknown> = {}
  return {
    set: vi.fn((data: Record<string, unknown>) => { Object.assign(ctx, data) }),
    error: vi.fn(),
    emit: vi.fn(),
    getContext: vi.fn(() => ({ ...ctx })),
  }
}

describe('evlog/trpc', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('createEvlogMiddleware', () => {
    describe('non-batch (path without coma)', () => {
      it('calls log.set with procedure and type, does not call log.error on success', async () => {
        const mockLog = makeHttpLog()
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

      it('sets ok: true on success', async () => {
        const mockLog = makeHttpLog()
        mockStorageRun.mockImplementation((_log: unknown, fn: () => unknown) => fn())

        const middleware = createEvlogMiddleware()
        await middleware({
          ctx: { log: mockLog },
          path: 'user.getById',
          type: 'query',
          next: async () => ({ ok: true }),
        })

        expect(mockLog.set).toHaveBeenCalledWith({ ok: true, duration: expect.any(String) })
      })

      it('calls log.error and sets ok: false on error', async () => {
        const mockLog = makeHttpLog()
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
        expect(mockLog.set).toHaveBeenCalledWith({ ok: false, duration: expect.any(String) })
      })

      it('captura panic throw síncrono/asíncrono en opts.next() devolviendo error a evlog y haciendo re-throw', async () => {
        const mockLog = makeHttpLog()
        mockStorageRun.mockImplementation((_log: unknown, fn: () => unknown) => fn())
        mockFormatDuration.mockReturnValue('2ms')

        const fatalError = new Error('tRPC panic')
        const middleware = createEvlogMiddleware()
        
        await expect(
          middleware({
            ctx: { log: mockLog },
            path: 'user.getById',
            type: 'query',
            next: async () => { throw fatalError },
          })
        ).rejects.toThrow('tRPC panic')

        expect(mockLog.error).toHaveBeenCalledWith(fatalError, { procedure: 'user.getById' })
        expect(mockLog.set).toHaveBeenCalledWith({ ok: false, duration: '2ms' })
      })

      it('runs opts.next() inside the storage with the HTTP logger', async () => {
        const mockLog = makeHttpLog()
        mockStorageRun.mockImplementation((_log: unknown, fn: () => unknown) => fn())

        const middleware = createEvlogMiddleware()
        await middleware({
          ctx: { log: mockLog },
          path: 'user.getById',
          type: 'query',
          next: async () => ({ ok: true }),
        })

        expect(mockStorageRun).toHaveBeenCalledWith(mockLog, expect.any(Function))
      })
    })

    describe('batch (path without coma)', () => {
      it('creates an isolated procedureLog and passes it to the storage', async () => {
        const procedureLog = makeProcedureLog()
        mockCreateRequestLogger.mockReturnValue(procedureLog)
        const mockLog = makeHttpLog('/trpc/user.getById,health.check')
        mockStorageRun.mockImplementation((_log: unknown, fn: () => unknown) => fn())

        const middleware = createEvlogMiddleware()
        await middleware({
          ctx: { log: mockLog },
          path: 'user.getById',
          type: 'query',
          next: async () => ({ ok: true }),
        })

        expect(mockCreateRequestLogger).toHaveBeenCalledWith(
          { method: undefined, path: '/trpc/user.getById,health.check', requestId: undefined },
          { _deferDrain: true },
        )
        expect(mockStorageRun).toHaveBeenCalledWith(procedureLog, expect.any(Function))
      })

      it('acumula el contexto del procedure en procedures{} del HTTP logger, keyed por nombre', async () => {
        const procedureLog = makeProcedureLog()
        mockCreateRequestLogger.mockReturnValue(procedureLog)
        const mockLog = makeHttpLog('/trpc/user.getById,health.check')
        mockStorageRun.mockImplementation((_log: unknown, fn: () => unknown) => fn())

        const middleware = createEvlogMiddleware()
        await middleware({
          ctx: { log: mockLog },
          path: 'user.getById',
          type: 'query',
          next: async () => ({ ok: true }),
        })

        const setCall = (mockLog.set as any).mock.calls.find(
          ([data]: any) => 'procedures' in (data as Record<string, unknown>),
        )
        expect(setCall).toBeDefined()
        const { procedures } = setCall![0] as { procedures: Record<string, unknown> }
        expect(Object.keys(procedures)).toHaveLength(1)
        expect(procedures['user.getById']).toMatchObject({ procedure: 'user.getById', type: 'query', ok: true })
      })

      it('dos procedures no se pisan — cada uno keyed por su nombre en procedures{}', async () => {
        const procedureLog1 = makeProcedureLog()
        const procedureLog2 = makeProcedureLog()
        mockCreateRequestLogger
          .mockReturnValueOnce(procedureLog1)
          .mockReturnValueOnce(procedureLog2)

        const mockLog = makeHttpLog('/trpc/user.getById,health.check')
        mockStorageRun.mockImplementation((_log: unknown, fn: () => unknown) => fn())

        const middleware = createEvlogMiddleware()

        await middleware({
          ctx: { log: mockLog },
          path: 'user.getById',
          type: 'query',
          next: async () => {
            procedureLog1.set({ userId: 'usr_123' })
            return { ok: true }
          },
        })

        await middleware({
          ctx: { log: mockLog },
          path: 'health.check',
          type: 'query',
          next: async () => ({ ok: true }),
        })

        const lastSet = (mockLog.set as any).mock.calls.at(-1)![0] as { procedures: Record<string, unknown> }
        expect(Object.keys(lastSet.procedures)).toHaveLength(2)
        expect(lastSet.procedures['user.getById']).toMatchObject({ userId: 'usr_123', ok: true })
        expect(lastSet.procedures['health.check']).toMatchObject({ ok: true })
        expect(lastSet.procedures['health.check']).not.toHaveProperty('userId')
      })

      it('error en procedure batch — ok: false en su entry, no afecta el HTTP logger', async () => {
        const procedureLog = makeProcedureLog()
        mockCreateRequestLogger.mockReturnValue(procedureLog)
        const mockLog = makeHttpLog('/trpc/user.getById,health.check')
        mockStorageRun.mockImplementation((_log: unknown, fn: () => unknown) => fn())

        const error = new Error('not found')
        const middleware = createEvlogMiddleware()
        await middleware({
          ctx: { log: mockLog },
          path: 'user.getById',
          type: 'query',
          next: async () => ({ ok: false, error }),
        })

        expect(procedureLog.error).toHaveBeenCalledWith(error, { procedure: 'user.getById' })
        expect(mockLog.error).not.toHaveBeenCalled()
        const setCall = (mockLog.set as any).mock.calls.find(
          ([data]: any) => 'procedures' in (data as Record<string, unknown>),
        )
        const { procedures } = setCall![0] as { procedures: Record<string, unknown> }
        expect(procedures['user.getById']).toMatchObject({ ok: false })
      })

      it('captura panic throw síncrono/asíncrono en batch devolviendo error a evlog y hace merge al main log', async () => {
        const procedureLog = makeProcedureLog()
        mockCreateRequestLogger.mockReturnValue(procedureLog)
        mockFormatDuration.mockReturnValue('3ms')
        const mockLog = makeHttpLog('/trpc/user.getById,health.check')
        mockStorageRun.mockImplementation((_log: unknown, fn: () => unknown) => fn())

        const fatalError = new Error('tRPC batch panic')
        const middleware = createEvlogMiddleware()
        
        await expect(
          middleware({
            ctx: { log: mockLog },
            path: 'user.getById',
            type: 'query',
            next: async () => { throw fatalError },
          })
        ).rejects.toThrow('tRPC batch panic')

        expect(procedureLog.error).toHaveBeenCalledWith(fatalError, { procedure: 'user.getById' })
        expect(procedureLog.set).toHaveBeenCalledWith({ ok: false, duration: '3ms' })
        
        // Verifica que paso por el finally y se mergeo la data parcial
        const setCall = (mockLog.set as any).mock.calls.find(
          ([data]: any) => 'procedures' in (data as Record<string, unknown>),
        )
        const { procedures } = setCall![0] as { procedures: Record<string, unknown> }
        expect(procedures['user.getById']).toMatchObject({ ok: false, duration: '3ms' })
      })

      it('incluye duration por procedure', async () => {
        const procedureLog = makeProcedureLog()
        mockCreateRequestLogger.mockReturnValue(procedureLog)
        mockFormatDuration.mockReturnValue('5ms')
        const mockLog = makeHttpLog('/trpc/user.getById,health.check')
        mockStorageRun.mockImplementation((_log: unknown, fn: () => unknown) => fn())

        const middleware = createEvlogMiddleware()
        await middleware({
          ctx: { log: mockLog },
          path: 'user.getById',
          type: 'query',
          next: async () => ({ ok: true }),
        })

        const setCall = (mockLog.set as any).mock.calls.find(
          ([data]: any) => 'procedures' in (data as Record<string, unknown>),
        )
        const { procedures } = setCall![0] as { procedures: Record<string, { duration: string }> }
        expect(procedures['user.getById']!.duration).toBe('5ms')
      })

      it('procedure con el mismo nombre en batch sobrescribe la entry anterior', async () => {
        const procedureLog1 = makeProcedureLog()
        const procedureLog2 = makeProcedureLog()
        mockCreateRequestLogger
          .mockReturnValueOnce(procedureLog1)
          .mockReturnValueOnce(procedureLog2)

        const mockLog = makeHttpLog('/trpc/user.getById,user.getById')
        mockStorageRun.mockImplementation((_log: unknown, fn: () => unknown) => fn())

        const middleware = createEvlogMiddleware()

        await middleware({
          ctx: { log: mockLog },
          path: 'user.getById',
          type: 'query',
          next: async () => {
            procedureLog1.set({ attempt: 1 })
            return { ok: true }
          },
        })
        await middleware({
          ctx: { log: mockLog },
          path: 'user.getById',
          type: 'query',
          next: async () => {
            procedureLog2.set({ attempt: 2 })
            return { ok: false, error: new Error('retry failed') }
          },
        })

        const lastSet = (mockLog.set as any).mock.calls.at(-1)![0] as { procedures: Record<string, unknown> }
        // mismo nombre → solo queda la última ejecución
        expect(Object.keys(lastSet.procedures)).toHaveLength(1)
        expect(lastSet.procedures['user.getById']).toMatchObject({ attempt: 2, ok: false })
      })
    })

    it('without HTTP adapter — throws error that includes [evlog/trpc]', async () => {
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
    it('injects log into the context along with the factory result', async () => {
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
