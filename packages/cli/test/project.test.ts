import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveProject } from '../src/lib/project'

const tempDirs: string[] = []

async function makeTree(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'evlog-cli-project-'))
  tempDirs.push(dir)
  for (const [path, contents] of Object.entries(files)) {
    const full = join(dir, path)
    await mkdir(join(full, '..'), { recursive: true })
    await writeFile(full, contents, 'utf-8')
  }
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(d => rm(d, { recursive: true, force: true })))
})

describe('resolveProject', () => {
  it('does not promote an unrelated ancestor package.json to root', async () => {
    const root = await makeTree({
      'package.json': JSON.stringify({ name: 'unrelated-parent' }),
      'apps/web/package.json': JSON.stringify({ name: 'web' }),
    })
    const cwd = join(root, 'apps/web')

    const project = await resolveProject(cwd)

    expect(project.kind).toBe('single')
    expect(project.packageDir).toBe(cwd)
    expect(project.root).toBe(cwd)
    expect(project.packageName).toBe('web')
  })

  it('promotes root when a workspace marker is found above the package', async () => {
    const root = await makeTree({
      'pnpm-workspace.yaml': 'packages:\n  - apps/*\n',
      'package.json': JSON.stringify({ name: 'monorepo', private: true }),
      'apps/web/package.json': JSON.stringify({ name: 'web' }),
    })
    const cwd = join(root, 'apps/web')

    const project = await resolveProject(cwd)

    expect(project.kind).toBe('pnpm')
    expect(project.packageDir).toBe(cwd)
    expect(project.root).toBe(root)
  })

  it('detects bun workspaces via bun.lock', async () => {
    const root = await makeTree({
      'bun.lock': '{ "lockfileVersion": 1 }\n',
      'package.json': JSON.stringify({
        name: 'monorepo',
        private: true,
        workspaces: ['apps/*'],
      }),
      'apps/web/package.json': JSON.stringify({ name: 'web' }),
    })
    const cwd = join(root, 'apps/web')

    const project = await resolveProject(cwd)

    expect(project.kind).toBe('bun')
    expect(project.packageDir).toBe(cwd)
    expect(project.root).toBe(root)
  })

  it('detects bun workspaces via legacy bun.lockb', async () => {
    const root = await makeTree({
      'bun.lockb': 'binary-stub',
      'package.json': JSON.stringify({
        name: 'monorepo',
        private: true,
        workspaces: ['packages/*'],
      }),
      'packages/app/package.json': JSON.stringify({ name: 'app' }),
    })

    const project = await resolveProject(join(root, 'packages/app'))

    expect(project.kind).toBe('bun')
    expect(project.root).toBe(root)
  })
})
