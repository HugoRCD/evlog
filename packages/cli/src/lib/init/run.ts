import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { CliContext } from '../../core/context'
import type { CliDebug } from '../debug'
import { createNoopCliDebug } from '../debug'
import { detectFramework } from '../map/detect'
import type { Framework } from '../map/types'
import { resolveEvlog, resolveProject } from '../project'
import type { PackageJson, ProjectInfo } from '../project'
import { planWiring } from './frameworks'
import type { FileAction, ManualStep } from './frameworks'
import { detectPackageManager, installCommand, runInstall } from './pm'
import type { PackageManager } from './pm'

export interface InstallOutcome {
  status: 'already' | 'installed' | 'skipped' | 'failed'
  /** The command as the user would type it — printed whatever the outcome. */
  command: string
  version?: string
  error?: string
}

export interface InitResult {
  project: Pick<ProjectInfo, 'cwd' | 'root' | 'packageDir' | 'kind' | 'packageName'>
  framework: Framework
  service: string
  packageManager: PackageManager
  install: InstallOutcome
  /** Files written (or that would be, under `--dry-run`). */
  written: FileAction[]
  already: string[]
  manual: ManualStep[]
  dryRun: boolean
}

export interface InitOptions {
  framework?: Framework
  service?: string
  /** Plan everything, write nothing. */
  dryRun?: boolean
  /** Run the package manager when evlog is missing. Default: true. */
  install?: boolean
  /** Write the local `.evlog/logs` sink. Default: true. */
  sink?: boolean
}

/**
 * Service name for the wide events this project will emit.
 *
 * Falls back to the package name without its scope: `@acme/checkout` is
 * `checkout` in a log line, and the scope is noise once every event carries it.
 */
function defaultService(project: ProjectInfo): string {
  const name = project.packageName
  if (!name) return 'app'
  const unscoped = name.startsWith('@') ? name.split('/').at(-1) ?? name : name
  return unscoped.replace(/[^a-z0-9-_]/gi, '-') || 'app'
}

/**
 * Which Nitro the project is on.
 *
 * The module lives at a different subpath per major (`evlog/nitro` vs
 * `evlog/nitro/v3`) and the config factory differs too, so guessing wrong
 * produces an import that does not resolve.
 */
function detectNitroMajor(pkg: PackageJson | null, framework: Framework): 2 | 3 {
  if (framework === 'tanstack-start') return 3
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies }
  if ('nitropack' in deps) return 2
  return 3
}

/**
 * Wire evlog into the project: install, patch the config, write the sink.
 *
 * Nothing here overwrites a file that already exists — an existing
 * `instrumentation.ts` is reported as already present rather than replaced,
 * because the cost of being wrong about someone's setup file is much higher
 * than the cost of them pasting four lines.
 */
export async function runInit(
  ctx: CliContext,
  log: CliDebug = createNoopCliDebug(),
  options: InitOptions = {},
): Promise<InitResult> {
  const project = await log.step(
    'resolveProject',
    () => resolveProject(ctx.cwd),
    p => ({ cwd: ctx.cwd, project: { kind: p.kind, root: p.root, name: p.packageName } }),
  )

  const { framework } = await log.step(
    'detectFramework',
    () => detectFramework(project, options.framework),
    r => ({ framework: r.framework }),
  )

  const resolved = await log.step(
    'resolveEvlog',
    () => resolveEvlog(project),
    r => ({ hasEvlog: !!r.install }),
  )

  const packageManager = detectPackageManager([project.packageDir, project.root])
  const command = installCommand(packageManager)
  const dryRun = options.dryRun === true

  let install: InstallOutcome
  if (resolved.install) {
    install = { status: 'already', command, version: resolved.install.version }
  } else if (options.install === false || dryRun) {
    install = { status: 'skipped', command }
  } else {
    const outcome = await log.step(
      'install',
      () => runInstall(packageManager, project.packageDir),
      r => ({ installed: r.ok }),
    )
    install = outcome.ok ? { status: 'installed', command } : { status: 'failed', command, error: outcome.error }
  }

  const service = options.service ?? defaultService(project)

  const plan = await log.step(
    'planWiring',
    () => planWiring({
      root: project.packageDir,
      framework,
      service,
      sink: options.sink !== false,
      nitroMajor: detectNitroMajor(project.packageJson, framework),
    }),
    r => ({ writes: r.actions.length, manual: r.manual.length }),
  )

  if (!dryRun) {
    await log.step('write', async () => {
      for (const action of plan.actions) {
        await mkdir(dirname(action.path), { recursive: true })
        await writeFile(action.path, action.contents, 'utf8')
      }
      return plan.actions.length
    })
  }

  log.set({ steps: ['done'] })

  return {
    project,
    framework,
    service,
    packageManager,
    install,
    written: plan.actions,
    already: plan.already,
    manual: plan.manual,
    dryRun,
  }
}
