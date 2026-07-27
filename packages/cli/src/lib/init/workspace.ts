import { readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { globSync } from 'tinyglobby'
import { detectFramework } from '../map/detect'
import type { Framework } from '../map/types'
import type { PackageJson, ProjectInfo } from '../project'

/** A workspace package `init` could set up. */
export interface WorkspaceApp {
  name: string
  /** Absolute package directory. */
  dir: string
  /** Path as the user would type it — `apps/web`. */
  label: string
  framework: Framework
}

/**
 * Whether this looks like a workspace root rather than an app.
 *
 * Running `init` from the root of a monorepo is a common mistake and a common
 * intent at the same time: either way, wiring the root package — which serves
 * no traffic — is never what was meant.
 */
export function isWorkspaceRoot(project: ProjectInfo): boolean {
  return project.kind !== 'single' && project.packageDir === project.root
}

/**
 * Find the apps in a workspace that `init` knows how to wire.
 *
 * Reads the workspace globs rather than walking the tree: a monorepo's
 * `node_modules` dwarfs its source, and the globs are the definition of what
 * counts as a package anyway. Packages with no detectable framework are left
 * out — a shared `utils` package has no entry points to instrument.
 */
export function findWorkspaceApps(project: ProjectInfo): WorkspaceApp[] {
  const patterns = workspaceGlobs(project)
  if (patterns.length === 0) return []

  const manifests = globSync(patterns.map(pattern => `${pattern}/package.json`), {
    cwd: project.root,
    absolute: true,
    ignore: ['**/node_modules/**'],
  })

  const apps: WorkspaceApp[] = []
  for (const manifest of manifests) {
    const dir = dirname(manifest)
    if (dir === project.root) continue

    let packageJson: PackageJson | null
    try {
      packageJson = JSON.parse(readFileSync(manifest, 'utf8')) as PackageJson
    } catch {
      continue
    }

    const candidate: ProjectInfo = {
      cwd: dir,
      packageDir: dir,
      root: project.root,
      kind: project.kind,
      packageName: packageJson.name ?? null,
      packageJson,
    }

    try {
      const { framework } = detectFramework(candidate)
      apps.push({
        name: packageJson.name ?? relative(project.root, dir),
        dir,
        label: relative(project.root, dir),
        framework,
      })
    } catch {
      /* No framework: a library, a config package, the docs site. Nothing to
         instrument, so nothing to offer. */
    }
  }

  return apps.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))
}

function workspaceGlobs(project: ProjectInfo): string[] {
  if (project.kind === 'pnpm') {
    try {
      const yaml = readFileSync(join(project.root, 'pnpm-workspace.yaml'), 'utf8')
      return parsePnpmPackages(yaml)
    } catch {
      return []
    }
  }

  const workspaces = project.packageJson?.workspaces
  if (Array.isArray(workspaces)) return workspaces
  if (workspaces?.packages) return workspaces.packages
  return []
}

/**
 * Read the `packages:` list out of `pnpm-workspace.yaml`.
 *
 * A three-line reader rather than a YAML dependency: the file's shape is fixed
 * by pnpm and this is the only key anybody needs from it. Negated globs are
 * dropped — tinyglobby takes them as patterns, not exclusions, so keeping them
 * would search for a directory literally named `!docs`.
 */
export function parsePnpmPackages(yaml: string): string[] {
  const patterns: string[] = []
  let inside = false

  for (const raw of yaml.split('\n')) {
    const line = raw.replace(/#.*$/, '').trimEnd()
    if (/^packages:\s*$/.test(line)) {
      inside = true
      continue
    }
    if (inside) {
      const entry = line.match(/^\s*-\s*['"]?([^'"\s]+)['"]?\s*$/)
      if (entry?.[1]) {
        if (!entry[1].startsWith('!')) patterns.push(entry[1])
        continue
      }
      if (line.trim().length > 0) break
    }
  }

  return patterns
}
