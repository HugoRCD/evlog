import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/* The real module graph reads `isCI` from `std-env` at import time, so the
   ephemeral-CI branch of `advanceRunState` is exercised here with a mocked
   environment where CI is always on. */
vi.mock('std-env', () => ({ isCI: true }))

const { advanceRunState } = await import('../src/run-state')

const TOOL = 'evlog-test'

describe('run state in ephemeral CI', () => {
  let base: string

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'evlog-run-state-ci-'))
    process.env.XDG_CONFIG_HOME = base
    delete process.env.EVLOG_TELEMETRY
    delete process.env.EVLOG_TELEMETRY_MACHINE_ID
  })

  afterEach(async () => {
    await rm(base, { recursive: true, force: true })
    delete process.env.XDG_CONFIG_HOME
    delete process.env.EVLOG_TELEMETRY_MACHINE_ID
  })

  it('omits the counter when CI has no stable machine identity', async () => {
    expect(await advanceRunState(TOOL, 'map', 60)).toBeUndefined()
    expect(existsSync(join(base, TOOL, 'telemetry', 'run-state.json'))).toBe(false)
  })

  it('keeps a counter when CI pins a machine id', async () => {
    process.env.EVLOG_TELEMETRY_MACHINE_ID = 'abc'
    expect(await advanceRunState(TOOL, 'map', 60)).toEqual({ ordinal: 1 })
    expect(await advanceRunState(TOOL, 'map', 72)).toEqual({ ordinal: 2, delta: 12 })
  })
})
