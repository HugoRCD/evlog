import { access, readFile, readdir, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'

export interface PackageJson {
  name?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  workspaces?: string[] | { packages?: string[] }
}

export type WorkspaceKind = 'single' | 'pnpm' | 'npm' | 'yarn'

export interface ProjectInfo {
  /** Directory the user ran from (or `--cwd`). */
  cwd: string
  /** Nearest package.json directory (may equal cwd). */
  packageDir: string
  /** Workspace / project root (pnpm-workspace, workspaces field, or packageDir). */
  root: string
  kind: WorkspaceKind
  packageName: string | null
  packageJson: PackageJson | null
}

export interface EvlogInstall {
  version: string
  /** Absolute path to the resolved `evlog` package root. */
  path: string
  /** Where it was declared, if found (`dependencies` / `devDependencies`). */
  declaredIn: string | null
  declaredRange: string | null
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Read and parse a JSON file; `null` on missing / invalid. */
export async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as T
  } catch {
    return null
  }
}

async function detectWorkspaceKind(dir: string, pkg: PackageJson | null): Promise<WorkspaceKind | null> {
  if (await exists(join(dir, 'pnpm-workspace.yaml'))) return 'pnpm'
  if (await exists(join(dir, 'yarn.lock')) && pkg?.workspaces) return 'yarn'
  if (pkg?.workspaces) return 'npm'
  return null
}

/**
 * Walk up from `start` to locate the nearest package and the workspace root.
 * Handles pnpm / npm / yarn workspaces and plain single packages.
 */
export async function resolveProject(start: string): Promise<ProjectInfo> {
  const cwd = resolve(start)
  let packageDir: string | null = null
  let packageJson: PackageJson | null = null
  let root = cwd
  let kind: WorkspaceKind = 'single'

  let dir = cwd
  for (;;) {
    const pkgPath = join(dir, 'package.json')
    if (await exists(pkgPath)) {
      const pkg = await readJson<PackageJson>(pkgPath)
      if (!packageDir) {
        packageDir = dir
        packageJson = pkg
      }
      const detected = await detectWorkspaceKind(dir, pkg)
      if (detected) {
        root = dir
        kind = detected
        break
      }
      // Keep walking — a parent may be the workspace root.
      root = dir
    }

    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  if (!packageDir) {
    return {
      cwd,
      packageDir: cwd,
      root: cwd,
      kind: 'single',
      packageName: null,
      packageJson: null,
    }
  }

  return {
    cwd,
    packageDir,
    root,
    kind,
    packageName: packageJson?.name ?? null,
    packageJson,
  }
}

function declaredEvlog(pkg: PackageJson | null): { range: string, field: string } | null {
  if (!pkg) return null
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
    const range = pkg[field]?.evlog
    if (range) return { range, field }
  }
  return null
}

/**
 * Resolve an installed `evlog` package by walking `node_modules` (hoist-aware)
 * via `createRequire`, then fall back to declared ranges in the local package.json.
 */
export async function resolveEvlog(project: ProjectInfo): Promise<{
  install: EvlogInstall | null
  declared: { range: string, field: string } | null
}> {
  const declared = declaredEvlog(project.packageJson)

  const candidates = [project.packageDir, project.root, project.cwd]
  for (const base of candidates) {
    const pkgJsonPath = join(base, 'package.json')
    if (!(await exists(pkgJsonPath))) continue
    try {
      const require = createRequire(pkgJsonPath)
      const resolved = require.resolve('evlog/package.json')
      const meta = await readJson<{ version?: string }>(resolved)
      if (meta?.version) {
        return {
          install: {
            version: meta.version,
            path: dirname(resolved),
            declaredIn: declared ? project.packageDir : null,
            declaredRange: declared?.range ?? null,
          },
          declared,
        }
      }
    } catch {
      // not resolvable from this base
    }
  }

  // Direct filesystem probe (no package.json at base, or createRequire failed)
  for (const base of candidates) {
    const direct = join(base, 'node_modules', 'evlog', 'package.json')
    const meta = await readJson<{ version?: string }>(direct)
    if (meta?.version) {
      return {
        install: {
          version: meta.version,
          path: dirname(direct),
          declaredIn: declared ? project.packageDir : null,
          declaredRange: declared?.range ?? null,
        },
        declared,
      }
    }
  }

  return { install: null, declared }
}

/** Relative path for display; `.` when identical. */
export function prettyPath(from: string, to: string): string {
  const rel = relative(from, to)
  if (!rel) return '.'
  return rel.split(sep).join('/')
}

/**
 * Locate a readable `.evlog/logs` sink — prefers cwd, then package dir, then root.
 */
export async function findLogsSink(project: ProjectInfo): Promise<{
  dir: string
  files: number
} | null> {
  for (const base of [project.cwd, project.packageDir, project.root]) {
    const dir = join(base, '.evlog', 'logs')
    try {
      await stat(dir)
      const entries = await readdir(dir)
      return { dir, files: entries.filter(f => f.endsWith('.jsonl')).length }
    } catch {
      // try next
    }
  }
  return null
}

/** Framework / integration hints based on package.json dependencies. */
export function detectStack(pkg: PackageJson | null): string[] {
  if (!pkg) return []
  const all = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  }
  const hits: string[] = []
  const probes: [string, string][] = [
    ['nuxt', 'nuxt'],
    ['next', 'next'],
    ['nitro', 'nitropack'],
    ['hono', 'hono'],
    ['express', 'express'],
    ['fastify', 'fastify'],
    ['@sveltejs/kit', 'sveltekit'],
    ['@evlog/nuxthub', 'nuxthub'],
    ['@evlog/telemetry', 'telemetry'],
  ]
  for (const [dep, label] of probes) {
    if (all[dep]) hits.push(label)
  }
  return hits
}
