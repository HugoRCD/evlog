import { describe, expect, it, vi } from 'vitest'
import type { DrainContext } from 'evlog'
import { ADAPTER_NAMES } from '../extension/extension'
import { resolveDrain } from '../extension/lib/adapters'

function drainContext(): DrainContext {
  return {
    event: { level: 'info', timestamp: new Date().toISOString(), message: 'turn' },
    request: { method: 'EVE', path: '/sessions/sess_1/turns/turn_0' },
  } as DrainContext
}

describe('resolveDrain', () => {
  it('resolves every advertised adapter name', () => {
    for (const name of ADAPTER_NAMES) {
      expect(typeof resolveDrain({ adapter: name })).toBe('function')
    }
  })

  it('accepts the object form with adapter options', () => {
    expect(typeof resolveDrain({ adapter: { type: 'memory', options: { limit: 10 } } })).toBe('function')
  })

  it('fans out to every configured adapter', async () => {
    const drain = resolveDrain({ adapter: ['memory', 'memory'] })
    const ctx = drainContext()

    await expect(drain(ctx)).resolves.not.toThrow()
  })

  it('keeps draining the other adapters when one fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const drain = resolveDrain({
      adapter: [{ type: 'otlp', options: { endpoint: 'http://127.0.0.1:1' } }, 'memory'],
    })

    await drain(drainContext())

    error.mockRestore()
  })
})
