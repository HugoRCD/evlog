import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCommand } from 'citty'
import { afterEach, describe, expect, it, vi } from 'vitest'
import map, { formatMapReport, runMap } from '../src/commands/map'
import { createContext } from '../src/core/context'
import type { CliContext } from '../src/core/context'
import { SCHEMA_VERSION } from '../src/core/output'
import { resolveCliEnvironment } from '../src/lib/environment'

const FIXTURES = join(import.meta.dirname, 'map/fixtures')

const tempDirs: string[] = []

async function copyFixture(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `evlog-cli-map-${name}-`))
  tempDirs.push(dir)
  await cp(join(FIXTURES, name), dir, { recursive: true })
  return dir
}

function fakeContext(cwd: string, overrides: Partial<CliContext> = {}): CliContext {
  return createContext({
    cwd,
    env: {},
    nodeVersion: 'v22.0.0',
    tty: false,
    color: false,
    columns: 80,
    ...overrides,
  })
}

afterEach(async () => {
  vi.restoreAllMocks()
  process.exitCode = undefined
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('runMap', () => {
  it('scans a nuxt fixture and scores its routes without writing evlog.map.json', async () => {
    const cwd = join(FIXTURES, 'nuxt-basic')
    const result = await runMap(fakeContext(cwd), undefined, { noWrite: true })

    expect(result.framework).toBe('nuxt')
    expect(result.mapPath).toBeNull()
    expect(result.scan.map.routes.length).toBeGreaterThan(0)
    const checkout = result.scan.map.routes.find(r => r.path === '/api/checkout')
    expect(checkout?.score).toBe(100)
  })

  it('writes evlog.map.json to the project root by default', async () => {
    const cwd = await copyFixture('nuxt-basic')
    const result = await runMap(fakeContext(cwd))

    expect(result.mapPath).toBe(join(cwd, 'evlog.map.json'))
    const written = JSON.parse(await readFile(result.mapPath!, 'utf-8')) as { version: number, routes: unknown[] }
    expect(written.version).toBe(1)
    expect(written.routes.length).toBe(result.scan.map.routes.length)
  })

  it('honors an explicit --framework override', async () => {
    const cwd = join(FIXTURES, 'tanstack-basic')
    const result = await runMap(fakeContext(cwd), undefined, { framework: 'tanstack-start', noWrite: true })
    expect(result.framework).toBe('tanstack-start')
  })

  it('throws a catalog error for an unsupported project', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'evlog-cli-map-unsupported-'))
    tempDirs.push(cwd)
    await expect(runMap(fakeContext(cwd), undefined, { noWrite: true })).rejects.toThrow(/no package\.json/i)
  })
})

describe('formatMapReport', () => {
  it('renders the report without ANSI in plain mode', async () => {
    const cwd = join(FIXTURES, 'nuxt-basic')
    const ctx = fakeContext(cwd)
    const result = await runMap(ctx, undefined, { noWrite: true })
    const out = formatMapReport(ctx, result)

    expect(out).not.toContain('\x1B')
    expect(out).toContain('ROUTES')
    expect(out).toContain('FINDINGS')
    expect(out).toContain(String(result.scan.map.score))
  })
})

describe('map command', () => {
  it('--no-write on real argv actually skips the write (regression: citty negates `write`, not a `noWrite` arg)', async () => {
    const cwd = await copyFixture('nuxt-basic')
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await runCommand(map, { rawArgs: ['--cwd', cwd, '--json', '--no-header', '--no-write'] })

    await expect(readFile(join(cwd, 'evlog.map.json'), 'utf-8')).rejects.toThrow()
  })

  it('writes evlog.map.json by default when no --no-write flag is passed', async () => {
    const cwd = await copyFixture('nuxt-basic')
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await runCommand(map, { rawArgs: ['--cwd', cwd, '--json', '--no-header'] })

    await expect(readFile(join(cwd, 'evlog.map.json'), 'utf-8')).resolves.toContain('"version": 1')
  })

  it('keeps the --json schema contract', async () => {
    const cwd = join(FIXTURES, 'nuxt-basic')

    const out: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      out.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString())
      return true
    }) as typeof process.stdout.write)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await map.run!({
      args: { json: true, noHeader: true, cwd, debug: false, write: false },
      rawArgs: [],
      cmd: map,
      data: {},
    })

    const raw = JSON.parse(out.join('').trim()) as {
      schemaVersion: number
      environment: string
      map: { version: number, framework: string, routes: unknown[] }
      summary: { instrumented: number, partial: number, dark: number, exempt: number }
      mapPath: string | null
    }

    expect(raw.schemaVersion).toBe(SCHEMA_VERSION)
    expect(raw.environment).toBe(resolveCliEnvironment())
    expect(raw.map.framework).toBe('nuxt')
    expect(raw.mapPath).toBeNull()
    expect(raw.summary.instrumented + raw.summary.partial + raw.summary.dark + raw.summary.exempt)
      .toBe(raw.map.routes.length)
  })

  it('exits 1 when the score is below --min-score', async () => {
    const cwd = join(FIXTURES, 'nuxt-basic')
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await map.run!({
      args: { json: true, noHeader: true, cwd, debug: false, write: false, minScore: '999' },
      rawArgs: [],
      cmd: map,
      data: {},
    })

    expect(process.exitCode).toBe(1)
  })

  it('leaves the exit code untouched without --min-score', async () => {
    const cwd = join(FIXTURES, 'nuxt-basic')
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await map.run!({
      args: { json: true, noHeader: true, cwd, debug: false, write: false },
      rawArgs: [],
      cmd: map,
      data: {},
    })

    expect(process.exitCode).toBeUndefined()
  })
})
