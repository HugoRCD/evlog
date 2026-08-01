import { afterEach, describe, expect, it, vi } from 'vitest'
import pkg from '../../package.json' with { type: 'json' }

/**
 * Regression tests for #462 — duplicate installs of the same major.
 *
 * pnpm and bun (isolated linker) hash evlog's optional peers into the store
 * path, so two workspaces that resolve `ai` or `zod` differently end up with
 * physically distinct copies of the *same* evlog version. Before the shared
 * registry, each copy had its own `AsyncLocalStorage` (so `useLogger()` threw
 * inside another copy's `withEvlog()`) and its own logger configuration (so
 * events emitted through the second copy were silently undrained and
 * unredacted).
 *
 * `vi.resetModules()` reproduces this faithfully: the second `import()`
 * re-evaluates every module in the graph, exactly like a second physical copy.
 */

/** Load a fresh evaluation of a module graph, as a duplicate install would. */
function loadCopy<T>(load: () => Promise<T>): Promise<T> {
  vi.resetModules()
  return load()
}

afterEach(async () => {
  vi.resetModules()
  const { resetGlobalRegistry } = await import('../../src/shared/globalRegistry')
  resetGlobalRegistry()
  vi.restoreAllMocks()
})

describe('duplicate installs (#462)', () => {
  it('shares the next.js request scope across copies', async () => {
    const copyA = await loadCopy(() => import('../../src/next/storage'))
    const copyB = await loadCopy(() => import('../../src/next/storage'))

    expect(copyA).not.toBe(copyB)
    expect(copyA.evlogStorage).toBe(copyB.evlogStorage)

    const logger = { marker: 'from-copy-a' } as never
    const seen = copyA.evlogStorage.run(logger, () => copyB.useLogger())
    expect(seen).toBe(logger)
  })

  it('shares request scope for storages created through createLoggerStorage', async () => {
    const copyA = await loadCopy(() => import('../../src/shared/storage'))
    const copyB = await loadCopy(() => import('../../src/shared/storage'))

    const a = copyA.createLoggerStorage('express hint', 'evlog:express')
    const b = copyB.createLoggerStorage('express hint', 'evlog:express')
    expect(a.storage).toBe(b.storage)

    const logger = { marker: 'shared' } as never
    expect(a.storage.run(logger, () => b.useLogger())).toBe(logger)
  })

  it('keeps distinct integrations on distinct storages', async () => {
    const { createLoggerStorage } = await import('../../src/shared/storage')
    const express = createLoggerStorage('express hint', 'evlog:express')
    const fastify = createLoggerStorage('fastify hint', 'evlog:fastify')

    expect(express.storage).not.toBe(fastify.storage)
    express.storage.run({} as never, () => {
      expect(() => fastify.useLogger()).toThrow(/outside of an evlog fastify hint/)
    })
  })

  it('applies a drain configured by one copy to events emitted by another', async () => {
    const copyA = await loadCopy(() => import('../../src/logger'))
    const copyB = await loadCopy(() => import('../../src/logger'))

    const drained: unknown[] = []
    copyA.initLogger({
      silent: true,
      drain: ({ event }) => {
        drained.push(event)
      },
    })

    expect(copyB.getGlobalDrain()).toBe(copyA.getGlobalDrain())
    expect(copyB.isLoggerInitialized()).toBe(true)

    copyB.log.info({ name: 'from-copy-b' })
    await vi.waitFor(() => expect(drained).toHaveLength(1))
    expect(drained[0]).toMatchObject({ name: 'from-copy-b' })
  })

  it('shares enabled/locked state across copies', async () => {
    const copyA = await loadCopy(() => import('../../src/logger'))
    const copyB = await loadCopy(() => import('../../src/logger'))

    copyA.initLogger({ enabled: false, silent: true, _suppressDrainWarning: true })
    expect(copyB.isEnabled()).toBe(false)

    copyA.lockLogger()
    expect(copyB.isLoggerLocked()).toBe(true)
  })

  it('recognizes an EvlogError thrown by another copy', async () => {
    const copyA = await loadCopy(() => import('../../src/error'))
    const copyB = await loadCopy(() => import('../../src/error'))

    const error = copyA.createError({ code: 'PAYMENT_DECLINED', status: 402, why: 'insufficient funds' })

    expect(error instanceof copyB.EvlogError).toBe(false)
    expect(copyB.EvlogError.isEvlogError(error)).toBe(true)
  })

  it('does not mistake a look-alike error for an EvlogError', async () => {
    const errorModule = await import('../../src/error')
    const impostor = Object.assign(new Error('nope'), { name: 'EvlogError', status: 402 })

    expect(errorModule.EvlogError.isEvlogError(impostor)).toBe(false)
    expect(errorModule.EvlogError.isEvlogError(null)).toBe(false)
    expect(errorModule.EvlogError.isEvlogError('EvlogError')).toBe(false)
  })

  it('keys the registry to the package major so majors never share state', async () => {
    const major = Number(pkg.version.split('.')[0])
    const { globalConfig } = await import('../../src/shared/globalRegistry')
    const slot = (globalThis as Record<symbol, { config: unknown } | undefined>)[
      Symbol.for(`evlog.registry.v${major}`)
    ]

    expect(slot?.config).toBe(globalConfig)
  })

  it('warns once when a second major joins the process', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const major = Number(pkg.version.split('.')[0])
    const majors = (globalThis as Record<symbol, Set<number> | undefined>)[Symbol.for('evlog.majors')]
    majors?.delete(major)
    majors?.add(major + 1)

    await loadCopy(() => import('../../src/shared/globalRegistry'))

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Multiple major versions of evlog'))
  })
})
