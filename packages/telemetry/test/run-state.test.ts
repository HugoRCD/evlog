import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { advanceRunState, purgeRunState } from '../src/run-state'
import { purgeTelemetryState } from '../src/consent'

const TOOL = 'evlog-test'

describe('run state', () => {
  let base: string

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'evlog-run-state-'))
    process.env.XDG_CONFIG_HOME = base
    /* Pin a machine id so the counter behaves as on a stable machine even when
       the test runner itself is in CI, where it would otherwise be ephemeral. */
    process.env.EVLOG_TELEMETRY_MACHINE_ID = 'test-machine'
    delete process.env.DO_NOT_TRACK
    delete process.env.EVLOG_TELEMETRY
  })

  afterEach(async () => {
    await rm(base, { recursive: true, force: true })
    delete process.env.XDG_CONFIG_HOME
    delete process.env.EVLOG_TELEMETRY_MACHINE_ID
  })

  it('starts at ordinal 1 with no delta', async () => {
    expect(await advanceRunState(TOOL, 'map', 60)).toEqual({ ordinal: 1 })
  })

  it('increments and reports the signed delta against the previous score', async () => {
    await advanceRunState(TOOL, 'map', 60)
    expect(await advanceRunState(TOOL, 'map', 72)).toEqual({ ordinal: 2, delta: 12 })
    expect(await advanceRunState(TOOL, 'map', 65)).toEqual({ ordinal: 3, delta: -7 })
  })

  it('keeps separate counters per command', async () => {
    await advanceRunState(TOOL, 'map', 60)
    expect(await advanceRunState(TOOL, 'doctor', 90)).toEqual({ ordinal: 1 })
    expect(await advanceRunState(TOOL, 'map', 70)).toEqual({ ordinal: 2, delta: 10 })
  })

  it('writes nothing when telemetry is off', async () => {
    process.env.EVLOG_TELEMETRY = '0'
    expect(await advanceRunState(TOOL, 'map', 60)).toBeUndefined()
    expect(existsSync(join(base, TOOL, 'telemetry', 'run-state.json'))).toBe(false)
  })

  it('writes nothing while DO_NOT_TRACK is set', async () => {
    process.env.DO_NOT_TRACK = '1'
    expect(await advanceRunState(TOOL, 'map', 60)).toBeUndefined()
    expect(existsSync(join(base, TOOL, 'telemetry', 'run-state.json'))).toBe(false)
  })

  it('resumes from the last persisted score once telemetry is back on', async () => {
    await advanceRunState(TOOL, 'map', 60)
    process.env.EVLOG_TELEMETRY = '0'
    expect(await advanceRunState(TOOL, 'map', 99)).toBeUndefined()
    delete process.env.EVLOG_TELEMETRY
    expect(await advanceRunState(TOOL, 'map', 66)).toEqual({ ordinal: 2, delta: 6 })
  })

  it('resets on purge so the next run is the first again', async () => {
    await advanceRunState(TOOL, 'map', 60)
    await purgeRunState(TOOL)
    expect(await advanceRunState(TOOL, 'map', 60)).toEqual({ ordinal: 1 })
  })

  it('resets through the opt-out purge', async () => {
    await advanceRunState(TOOL, 'map', 60)
    await purgeTelemetryState(TOOL)
    expect(await advanceRunState(TOOL, 'map', 70)).toEqual({ ordinal: 1 })
  })

  it('survives a corrupt state file by starting over', async () => {
    const dir = join(base, TOOL, 'telemetry')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'run-state.json'), '{not json', 'utf-8')
    expect(await advanceRunState(TOOL, 'map', 60)).toEqual({ ordinal: 1 })
  })

  it('ignores malformed entries and keeps the valid ones', async () => {
    const dir = join(base, TOOL, 'telemetry')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'run-state.json'),
      JSON.stringify({ map: { ordinal: 4, lastScore: 80 }, broken: { ordinal: 'x', lastScore: 1 } }),
      'utf-8',
    )
    expect(await advanceRunState(TOOL, 'map', 84)).toEqual({ ordinal: 5, delta: 4 })
    expect(JSON.parse(await readFile(join(dir, 'run-state.json'), 'utf-8')).broken).toBeUndefined()
  })
})
