import { afterEach, describe, expect, it, vi } from 'vitest'
import { createContext } from '../src/core/context'
import {
  createCliDebug,
  createCliLogger,
  ensureCliDebugLogger,
  resetCliDebugLoggerForTests,
  wantsDebug,
  withCliDebug,
} from '../src/lib/debug'

const base = {
  cwd: '/tmp',
  env: {} as Record<string, string | undefined>,
  nodeVersion: 'v22.0.0',
  tty: false,
  color: false,
  columns: 80,
}

afterEach(() => {
  resetCliDebugLoggerForTests()
  vi.restoreAllMocks()
})

describe('wantsDebug', () => {
  it('is off by default', () => {
    const ctx = createContext({ ...base, env: {} })
    expect(wantsDebug(ctx, {}, [])).toBe(false)
  })

  it('respects --debug, args.debug, and EVLOG_CLI_DEBUG', () => {
    const ctx = createContext({ ...base, env: {} })
    expect(wantsDebug(ctx, { debug: true }, [])).toBe(true)
    expect(wantsDebug(ctx, {}, ['node', 'evlog', 'doctor', '--debug'])).toBe(true)
    expect(wantsDebug(createContext({ ...base, env: { EVLOG_CLI_DEBUG: '1' } }), {}, [])).toBe(true)
  })
})

describe('withCliDebug', () => {
  it('passes a noop log when debug is off (step still runs)', async () => {
    const ctx = createContext({ ...base, env: {} })
    let ran = false
    const log = await withCliDebug(ctx, { command: 'doctor' }, async (l) => {
      await l.step('work', () => {
        ran = true
      })
      return l
    })
    expect(ran).toBe(true)
    expect(log.raw).toBeUndefined()
  })

  it('emits a wide event to stderr when --json and debug are on', async () => {
    const writes: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString())
      return true
    }) as typeof process.stderr.write)

    const ctx = createContext({ ...base, env: { EVLOG_CLI_DEBUG: '1' } })
    await withCliDebug(ctx, { command: 'doctor', json: true, debug: true }, async (log) => {
      expect(log.raw).toBeDefined()
      await log.step('a', () => undefined)
      await log.step('b', () => undefined)
    })

    const line = writes.find(w => w.includes('"command":"doctor"'))
    expect(line).toBeDefined()
    const event = JSON.parse(line!.trim())
    expect(event.command).toBe('doctor')
    expect(event.steps).toEqual(['a', 'b'])
    expect(event.service).toBe('evlog-cli')
    expect(typeof event.environment).toBe('string')
  })

  it('records the failed step then wraps unexpected throws', async () => {
    const writes: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString())
      return true
    }) as typeof process.stderr.write)

    const ctx = createContext({ ...base, env: {} })
    await expect(withCliDebug(ctx, { command: 'doctor', json: true, debug: true }, async (log) => {
      await log.step('before', () => 'ok')
      await log.step('boom', () => {
        throw new Error('boom')
      })
    })).rejects.toThrow('boom')

    const line = writes.find(w => w.includes('"command":"doctor"'))
    expect(line).toBeDefined()
    const event = JSON.parse(line!.trim())
    expect(event.steps).toEqual(['before', 'boom'])
    expect(event.stepFailed).toBe('boom')
    expect(event.error?.code).toBe('cli.COMMAND_FAILED')
  })

  it('log.step merges fields from the result callback', async () => {
    ensureCliDebugLogger({ json: true })
    const raw = createCliLogger({ command: 'x' })
    const log = createCliDebug(raw)
    await log.step('one', () => ({ n: 1 }), r => ({ cwd: '/tmp', n: r.n }))
    expect(raw.getContext().steps).toEqual(['one'])
    expect(raw.getContext().cwd).toBe('/tmp')
    expect(raw.getContext().n).toBe(1)
  })

  it('log.finding accepts a catalog factory', async () => {
    const { cliErrors } = await import('../src/lib/errors')
    ensureCliDebugLogger({ json: true })
    const raw = createCliLogger({ command: 'x' })
    const log = createCliDebug(raw)
    log.finding(cliErrors.EVLOG_NOT_FOUND, { id: 'evlog', status: 'warn' })
    const findings = raw.getContext().findings as Array<Record<string, unknown>>
    expect(findings).toEqual([
      expect.objectContaining({
        code: 'cli.EVLOG_NOT_FOUND',
        id: 'evlog',
        status: 'warn',
        why: expect.any(String),
        fix: expect.any(String),
      }),
    ])
  })
})
