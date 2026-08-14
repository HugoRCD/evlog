import { describe, expect, it, vi } from 'vitest'
import { prewarmSandbox } from './sandbox-prewarm'

describe('prewarmSandbox', () => {
  it('opens the sandbox and returns before it resolves', () => {
    const getSandbox = vi.fn(() => new Promise<never>(() => {}))

    expect(prewarmSandbox({ getSandbox } as never)).toBeUndefined()
    expect(getSandbox).toHaveBeenCalledOnce()
  })

  it('swallows a failed open so the turn does not fail with it', async () => {
    const error = new Error('sandbox unavailable')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => prewarmSandbox({ getSandbox: () => Promise.reject(error) } as never)).not.toThrow()
    await new Promise(resolve => setImmediate(resolve))

    expect(consoleError).toHaveBeenCalledWith('[evi:sandbox] prewarm failed', error)
    consoleError.mockRestore()
  })
})
