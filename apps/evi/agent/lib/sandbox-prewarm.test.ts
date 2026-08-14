import { describe, expect, it, vi } from 'vitest'

const set = vi.fn()
const useLogger = vi.fn((_ctx: unknown) => ({ set }))

vi.mock('evlog/eve', () => ({ useLogger: (ctx: unknown) => useLogger(ctx) }))

const { prewarmSandbox } = await import('./sandbox-prewarm')

function context(getSandbox: () => Promise<unknown>) {
  return { getSandbox, session: { id: 'session-1' } } as never
}

const flush = () => new Promise(resolve => setImmediate(resolve))

describe('prewarmSandbox', () => {
  it('opens the sandbox and returns before it resolves', () => {
    const getSandbox = vi.fn(() => new Promise<never>(() => {}))

    expect(prewarmSandbox(context(getSandbox))).toBeUndefined()
    expect(getSandbox).toHaveBeenCalledOnce()
  })

  it('records how long the open took on the turn', async () => {
    set.mockClear()

    prewarmSandbox(context(() => Promise.resolve({})))
    await flush()

    expect(set).toHaveBeenCalledWith({ sandbox: { openMs: expect.any(Number) } })
  })

  it('drops the sample when the open outlives its turn', async () => {
    set.mockClear()
    useLogger.mockImplementationOnce(() => { throw new Error('outside an evlog eve turn') })
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})

    prewarmSandbox(context(() => Promise.resolve({})))
    await flush()

    expect(set).not.toHaveBeenCalled()
    expect(consoleInfo).toHaveBeenCalled()
    consoleInfo.mockRestore()
  })

  it('swallows a failed open so the turn does not fail with it', async () => {
    const error = new Error('sandbox unavailable')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => prewarmSandbox(context(() => Promise.reject(error)))).not.toThrow()
    await flush()

    expect(consoleError).toHaveBeenCalledWith('[evi:sandbox] prewarm failed', error)
    consoleError.mockRestore()
  })
})
