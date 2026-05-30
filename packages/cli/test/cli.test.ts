import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineErrorCatalog, EvlogError, initLogger } from 'evlog'
import { createDrainPipeline } from 'evlog/pipeline'
import { setupEvlog, createCommandLogger, parseCliError } from '../src/index'
import { resetFlushOnExitForTests } from '../src/flush'
import { createDrainSpy, findEventViaDrain, waitForDrainCalls } from './helpers/drain'

describe('@evlog/cli', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    resetFlushOnExitForTests()
  })

  describe('invoke', () => {
    it('emits a wide event with CLI method, path, duration, and status', async () => {
      const drainSpy = vi.fn()
      const pipeline = createDrainPipeline({ batch: { size: 1, intervalMs: 50_000 } })
      const drain = pipeline((batch) => {
        for (const event of batch) drainSpy(event)
      })

      const setup = setupEvlog({
        service: 'cli-test',
        version: '1.2.3',
        drain,
        flushOnExit: false,
        redact: false,
        pretty: false,
        silent: true,
      })

      await setup.invoke({ command: 'doctor', argv: ['doctor'] }, (log) => {
        log.set({ checks: { passed: 2 } })
      })

      await drain.flush()
      await waitForDrainCalls(drainSpy as never, 1)

      const event = findEventViaDrain(drainSpy as never, e => e.path === '/doctor')
      expect(event).toBeDefined()
      expect(event!.method).toBe('CLI')
      expect(event!.path).toBe('/doctor')
      expect(event!.status).toBe(0)
      expect(event!.duration).toBeDefined()
      expect(event!.checks).toEqual({ passed: 2 })
      expect((event as Record<string, unknown>).cli).toMatchObject({
        command: 'doctor',
        version: '1.2.3',
      })
    })

    it('does not auto-emit when longRunning is true', async () => {
      const drain = createDrainSpy()
      const setup = setupEvlog({
        service: 'cli-test',
        drain,
        flushOnExit: false,
        redact: false,
        silent: true,
      })

      await setup.invoke({ command: 'run', longRunning: true }, () => {
        // handler returns without emit
      })

      expect(drain.mock.calls.length).toBe(0)
    })

    it('records catalog errors on finish and re-throws', async () => {
      const drain = createDrainSpy()
      const errorCatalog = defineErrorCatalog('testcli', {
        CONFIG_MISSING: {
          status: 1,
          message: 'Config missing',
          fix: 'Create config.json',
        },
      })

      const setup = setupEvlog({
        service: 'cli-test',
        errorCatalog,
        drain,
        flushOnExit: false,
        redact: false,
        silent: true,
      })

      await expect(
        setup.invoke({ command: 'pull' }, () => {
          throw errorCatalog.CONFIG_MISSING()
        }),
      ).rejects.toThrow('Config missing')

      await waitForDrainCalls(drain, 1)
      const event = findEventViaDrain(drain, e => e.path === '/pull')
      expect(event?.error).toMatchObject({ message: 'Config missing' })
    })
  })

  describe('createCommandLogger', () => {
    it('creates a logger with CLI context without global bootstrap', () => {
      initLogger({ env: { service: 'host' }, silent: true })

      const log = createCommandLogger({
        command: 'migrate',
        version: '0.0.1',
        argv: ['migrate', '--yes'],
      })

      log.set({ records: 10 })
      const event = log.emit({ status: 0 })

      expect(event).toBeDefined()
      expect(event!.method).toBe('CLI')
      expect(event!.path).toBe('/migrate')
      expect((event as Record<string, unknown>).cli).toMatchObject({
        command: 'migrate',
        version: '0.0.1',
      })
    })
  })

  describe('parseCliError', () => {
    it('maps fix and internal.hint to hint with exit code', () => {
      const err = new EvlogError({
        code: 'testcli.CONFIG_MISSING',
        message: 'Missing config',
        status: 1,
        fix: 'Run init',
        internal: { hint: 'ignored when fix is set' },
      })

      expect(parseCliError(err)).toMatchObject({
        code: 'testcli.CONFIG_MISSING',
        message: 'Missing config',
        hint: 'Run init',
        exitCode: 1,
      })
    })

    it('falls back to internal.hint when fix is absent', () => {
      const err = new EvlogError({
        code: 'testcli.BROKEN',
        message: 'Broken',
        status: 2,
        internal: { hint: 'Try again' },
      })

      expect(parseCliError(err).hint).toBe('Try again')
      expect(parseCliError(err).exitCode).toBe(2)
    })
  })

  describe('redact', () => {
    it('strips token flags before drain', async () => {
      const drain = createDrainSpy()
      const setup = setupEvlog({
        service: 'cli-test',
        drain,
        flushOnExit: false,
        redact: true,
        silent: true,
      })

      await setup.invoke(
        {
          command: 'login',
          flags: { token: 'shlv_secret_token_abc' },
        },
        () => {},
      )

      await waitForDrainCalls(drain, 1)
      const event = findEventViaDrain(drain, e => e.path === '/login')
      const cli = (event as Record<string, unknown>).cli as Record<string, unknown>
      expect(cli.flags).toEqual({ token: '[REDACTED]' })
    })
  })

  describe('logToConsole', () => {
    it('keeps evlog console silent by default', async () => {
      const consoleSpy = vi.spyOn(console, 'log')
      const drain = createDrainSpy()

      const setup = setupEvlog({
        service: 'cli-test',
        drain,
        flushOnExit: false,
        redact: false,
      })

      await setup.invoke({ command: 'status', argv: ['status'] }, (log) => {
        log.set({ ok: true })
      })

      expect(consoleSpy).not.toHaveBeenCalled()
    })

    it('prints wide events when --log is passed', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const drain = createDrainSpy()

      const setup = setupEvlog({
        service: 'cli-test',
        drain,
        flushOnExit: false,
        redact: false,
      })

      await setup.invoke({ command: 'status', argv: ['status', '--log'] }, (log) => {
        log.set({ ok: true })
      })

      expect(consoleSpy).toHaveBeenCalled()
    })

    it('prints wide events when logToConsole is true in config', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const drain = createDrainSpy()

      const setup = setupEvlog({
        service: 'cli-test',
        drain,
        flushOnExit: false,
        redact: false,
        logToConsole: true,
      })

      await setup.invoke({ command: 'status', argv: ['status'] }, (log) => {
        log.set({ ok: true })
      })

      expect(consoleSpy).toHaveBeenCalled()
    })
  })

  describe('audit', () => {
    it('includes audit fields on the emitted wide event', async () => {
      const drain = createDrainSpy()
      const setup = setupEvlog({
        service: 'cli-test',
        drain,
        flushOnExit: false,
        redact: false,
        silent: true,
      })

      await setup.invoke({ command: 'pull' }, (log) => {
        log.audit({
          action: 'testcli.SECRET_PULL',
          actor: { type: 'user', id: 'u-1' },
          target: { type: 'env', id: 'prod' },
        })
      })

      await waitForDrainCalls(drain, 1)
      const event = findEventViaDrain(drain, e => e.path === '/pull')
      expect(event?.audit).toMatchObject({
        action: 'testcli.SECRET_PULL',
        actor: { type: 'user', id: 'u-1' },
      })
    })
  })
})
