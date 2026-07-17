import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { formatDoctorReport, runDoctor } from '../src/commands/doctor'
import { createContext } from '../src/core/context'
import type { CliContext } from '../src/core/context'
import { SCHEMA_VERSION } from '../src/core/output'

const tempDirs: string[] = []

async function makeProject(files: Record<string, string> = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'evlog-cli-doctor-'))
  tempDirs.push(dir)
  for (const [path, contents] of Object.entries(files)) {
    const full = join(dir, path)
    await mkdir(join(full, '..'), { recursive: true })
    await writeFile(full, contents, 'utf-8')
  }
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
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('runDoctor', () => {
  it('reports a healthy single-package project', async () => {
    const cwd = await makeProject({
      'package.json': JSON.stringify({ name: 'app', dependencies: { evlog: '^2.0.0' } }),
      'node_modules/evlog/package.json': JSON.stringify({ name: 'evlog', version: '2.22.0' }),
      '.evlog/logs/2026-07-17.jsonl': '{"event":"request"}\n',
    })

    const result = await runDoctor(fakeContext(cwd))

    expect(result.summary.fail).toBe(0)
    expect(result.checks.find(c => c.id === 'evlog')?.status).toBe('ok')
    expect(result.checks.find(c => c.id === 'evlog')?.message).toContain('2.22.0')
    expect(result.checks.find(c => c.id === 'logs')?.status).toBe('ok')
    expect(result.project.kind).toBe('single')
  })

  it('resolves evlog from a pnpm workspace root when run in a child package', async () => {
    const root = await makeProject({
      'pnpm-workspace.yaml': 'packages:\n  - apps/*\n',
      'package.json': JSON.stringify({ name: 'monorepo', private: true }),
      'apps/web/package.json': JSON.stringify({
        name: 'web',
        dependencies: { nuxt: '^3.0.0', evlog: 'workspace:*' },
      }),
      'node_modules/evlog/package.json': JSON.stringify({ name: 'evlog', version: '2.22.0' }),
    })
    const cwd = join(root, 'apps/web')

    const result = await runDoctor(fakeContext(cwd))

    expect(result.project.kind).toBe('pnpm')
    expect(result.project.name).toBe('web')
    expect(result.checks.find(c => c.id === 'evlog')?.status).toBe('ok')
    expect(result.checks.find(c => c.id === 'stack')?.message).toContain('nuxt')
  })

  it('finds .evlog/logs at the workspace root from a child cwd', async () => {
    const root = await makeProject({
      'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
      'package.json': JSON.stringify({ name: 'mono', private: true }),
      'packages/app/package.json': JSON.stringify({ name: 'app', dependencies: { evlog: '^2.0.0' } }),
      'node_modules/evlog/package.json': JSON.stringify({ name: 'evlog', version: '2.22.0' }),
      '.evlog/logs/2026-07-17.jsonl': '{"event":"request"}\n',
    })

    const result = await runDoctor(fakeContext(join(root, 'packages/app')))
    const logs = result.checks.find(c => c.id === 'logs')
    expect(logs?.status).toBe('ok')
    expect(logs?.message).toContain('1 file')
  })

  it('fails on unsupported Node versions', async () => {
    const cwd = await makeProject({ 'package.json': '{}' })
    const result = await runDoctor(fakeContext(cwd, { nodeVersion: 'v18.19.0' }))

    const node = result.checks.find(c => c.id === 'node')
    expect(node?.status).toBe('fail')
    expect(result.summary.fail).toBeGreaterThan(0)
  })

  it('warns when evlog is declared but not installed', async () => {
    const cwd = await makeProject({
      'package.json': JSON.stringify({ name: 'app', devDependencies: { evlog: '^2.0.0' } }),
    })

    const result = await runDoctor(fakeContext(cwd))
    const evlog = result.checks.find(c => c.id === 'evlog')
    expect(evlog?.status).toBe('warn')
    expect(evlog?.message).toContain('not installed')
  })

  it('warns outside a Node project', async () => {
    const cwd = await makeProject()
    const result = await runDoctor(fakeContext(cwd))
    expect(result.checks.find(c => c.id === 'project')?.status).toBe('warn')
    expect(result.summary.fail).toBe(0)
  })

  it('keeps the --json schema contract', async () => {
    const cwd = await makeProject({
      'package.json': JSON.stringify({ name: 'app', dependencies: { evlog: '^2.0.0' } }),
      'node_modules/evlog/package.json': JSON.stringify({ name: 'evlog', version: '2.22.0' }),
      '.evlog/logs/2026-07-17.jsonl': '{"event":"request"}\n',
    })

    const result = await runDoctor(fakeContext(cwd))
    const payload = {
      schemaVersion: SCHEMA_VERSION,
      project: {
        kind: result.project.kind,
        name: result.project.name,
        stack: result.project.stack,
      },
      checks: result.checks.map(({ id, status, message }) => ({ id, status, message })),
      summary: result.summary,
    }

    expect(payload).toMatchInlineSnapshot(`
      {
        "checks": [
          {
            "id": "node",
            "message": "v22.0.0",
            "status": "ok",
          },
          {
            "id": "project",
            "message": "app",
            "status": "ok",
          },
          {
            "id": "evlog",
            "message": "v2.22.0 (^2.0.0)",
            "status": "ok",
          },
          {
            "id": "logs",
            "message": "1 file · .evlog/logs",
            "status": "ok",
          },
        ],
        "project": {
          "kind": "single",
          "name": "app",
          "stack": [],
        },
        "schemaVersion": 1,
        "summary": {
          "fail": 0,
          "ok": 4,
          "warn": 0,
        },
      }
    `)
  })
})

describe('formatDoctorReport', () => {
  it('renders sections without ANSI in plain mode', async () => {
    const cwd = await makeProject({
      'package.json': JSON.stringify({ name: 'app', dependencies: { evlog: '^2.0.0' } }),
      'node_modules/evlog/package.json': JSON.stringify({ name: 'evlog', version: '2.22.0' }),
    })
    const ctx = fakeContext(cwd)
    const result = await runDoctor(ctx)
    const out = formatDoctorReport(ctx, result)

    expect(out).not.toContain('\x1B')
    expect(out).toContain('evlog doctor')
    expect(out).toContain('ENVIRONMENT')
    expect(out).toContain('EVLOG')
    expect(out).toContain('docs')
  })
})
