import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineCommand } from 'citty'
import { setupEvlog, useLogger } from '../src/index'
import { runMain } from '../src/citty'
import { createDrainSpy, findEventViaDrain, waitForDrainCalls } from './helpers/drain'

describe('@evlog/cli/citty', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('wraps subcommand run() with invoke lifecycle', async () => {
    const drain = createDrainSpy()
    let sawLogger = false

    const setup = setupEvlog({
      service: 'citty-test',
      drain,
      flushOnExit: false,
      redact: false,
      silent: true,
    })

    const main = defineCommand({
      meta: { name: 'demo', version: '0.0.0' },
      subCommands: {
        doctor: defineCommand({
          meta: { name: 'doctor', description: 'Run checks' },
          run() {
            const log = useLogger()
            sawLogger = typeof log.set === 'function'
            log.set({ checks: { passed: 1 } })
          },
        }),
      },
    })

    await runMain(main, setup, { rawArgs: ['doctor'] })

    expect(sawLogger).toBe(true)
    await waitForDrainCalls(drain, 1)

    const event = findEventViaDrain(drain, e => e.path === '/doctor')
    expect(event).toMatchObject({
      method: 'CLI',
      path: '/doctor',
      status: 0,
      checks: { passed: 1 },
    })
  })

  it('auto-injects --log arg on wrapped commands', async () => {
    const drain = createDrainSpy()
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const setup = setupEvlog({
      service: 'citty-test',
      drain,
      flushOnExit: false,
      redact: false,
    })

    const main = defineCommand({
      meta: { name: 'demo', version: '0.0.0' },
      subCommands: {
        status: defineCommand({
          meta: { name: 'status' },
          run({ args }) {
            const log = useLogger()
            log.set({ ok: true })
            expect(args.log).toBe(true)
          },
        }),
      },
    })

    await runMain(main, setup, { rawArgs: ['status', '--log'] })

    expect(consoleSpy).toHaveBeenCalled()
  })
})
