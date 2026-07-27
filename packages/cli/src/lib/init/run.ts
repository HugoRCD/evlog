import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { CliContext } from '../../core/context'
import type { CliDebug } from '../debug'
import { createNoopCliDebug } from '../debug'
import { detectFramework } from '../map/detect'
import type { Framework } from '../map/types'
import { resolveEvlog, resolveProject } from '../project'
import type { PackageJson, ProjectInfo } from '../project'
import type { DrainId, ExtraId } from './catalog'
import { planWiring } from './frameworks'
import type { FileAction, ManualStep } from './frameworks'
import { detectPackageManager, installCommand, runInstall } from './pm'
import type { PackageManager } from './pm'
import {
  askAnswers,
  canPrompt,
  closeCancelled,
  closeInteractive,
  confirmPlan,
  InitCancelled,
  noteEnvironment,
  noteManual,
  openInteractive,
} from './prompts'
import type { InitAnswers } from './prompts'
import { droppedExtras, resolveAnswers } from './resolve'

export interface InstallOutcome {
  status: 'already' | 'installed' | 'skipped' | 'failed'
  /** The command as the user would type it — printed whatever the outcome. */
  command: string
  version?: string
  error?: string
}

export interface InitResult {
  project: Pick<ProjectInfo, 'cwd' | 'root' | 'packageDir' | 'kind' | 'packageName'>
  answers: InitAnswers
  packageManager: PackageManager
  install: InstallOutcome
  /** Files written (or that would be, under `--dry-run`). */
  written: FileAction[]
  already: string[]
  manual: ManualStep[]
  /** Extras asked for that this framework or drain cannot use. */
  dropped: ExtraId[]
  dryRun: boolean
  /** True when the run asked questions — the report stays quiet if so. */
  interactive: boolean
  /** True when the user answered "no" at the plan, or hit Ctrl-C. */
  cancelled: boolean
}

export interface InitOptions {
  framework?: Framework
  service?: string
  drain?: DrainId
  extras?: ExtraId[]
  /** Plan everything, write nothing. */
  dryRun?: boolean
  /** Run the package manager when evlog is missing. Default: true. */
  install?: boolean
  /** Skip every question and take the defaults. */
  yes?: boolean
  /** Force non-interactive regardless of the terminal (set by `--json`). */
  nonInteractive?: boolean
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
 * Wire evlog into the project: ask, plan, confirm, write.
 *
 * Interactive when there is somebody to answer and nothing says otherwise;
 * flags and defaults fill in everything when there is not, so an agent gets the
 * same run without ever waiting on a keystroke. Both paths produce the same
 * {@link InitAnswers} and share every step after it.
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

  const detection = await log.step(
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
  const evlogInstalled = !!resolved.install

  const interactive = !options.nonInteractive && !options.yes && canPrompt(ctx)

  const base = {
    framework: detection.framework,
    defaultService: defaultService(project),
    evlogInstalled,
    install: options.install !== false,
    drain: options.drain,
    extras: options.extras,
    service: options.service,
  }

  let answers: InitAnswers
  let confirmed = true

  if (interactive) {
    openInteractive(ctx, project.packageName ?? project.packageDir)
    try {
      answers = await askAnswers({
        ctx,
        detected: detection.framework,
        /* An explicit --framework is an answer, not a guess: do not ask again. */
        uncertain: options.framework === undefined && detection.warnings.length > 0,
        defaultService: base.defaultService,
        evlogInstalled,
        installRequested: base.install,
        packageManager,
      })
    } catch (error) {
      if (error instanceof InitCancelled) {
        closeCancelled()
        return cancelledResult({ project, answers: resolveAnswers(base), packageManager, command, dryRun })
      }
      throw error
    }
  } else {
    answers = resolveAnswers(base)
  }

  log.set({ drain: answers.drain, extras: answers.extras.join(',') || 'none' })

  const plan = await log.step(
    'planWiring',
    () => planWiring({
      root: project.packageDir,
      framework: answers.framework,
      service: answers.service,
      drain: answers.drain,
      extras: answers.extras,
      nitroMajor: detectNitroMajor(project.packageJson, answers.framework),
    }),
    r => ({ writes: r.actions.length, manual: r.manual.length }),
  )

  const installing = !evlogInstalled && answers.install && !dryRun

  if (interactive && !dryRun) {
    try {
      confirmed = await confirmPlan(plan.actions, plan.already, installing, packageManager)
    } catch (error) {
      if (error instanceof InitCancelled) {
        closeCancelled()
        return cancelledResult({ project, answers, packageManager, command, dryRun })
      }
      throw error
    }
    if (!confirmed) {
      closeCancelled()
      return cancelledResult({ project, answers, packageManager, command, dryRun })
    }
  }

  let install: InstallOutcome
  if (evlogInstalled) {
    install = { status: 'already', command, version: resolved.install!.version }
  } else if (!answers.install || dryRun) {
    install = { status: 'skipped', command }
  } else {
    const outcome = await log.step(
      'install',
      () => runInstall(packageManager, project.packageDir),
      r => ({ installed: r.ok }),
    )
    install = outcome.ok ? { status: 'installed', command } : { status: 'failed', command, error: outcome.error }
  }

  if (!dryRun) {
    await log.step('write', async () => {
      for (const action of plan.actions) {
        await mkdir(dirname(action.path), { recursive: true })
        await writeFile(action.path, action.contents, 'utf8')
      }
      return plan.actions.length
    })
  }

  if (interactive) {
    noteEnvironment(answers.drain)
    noteManual(plan.manual)
    closeInteractive(ctx, answers.framework, frameworkDocs(answers.framework))
  }

  log.set({ steps: ['done'] })

  return {
    project,
    answers,
    packageManager,
    install,
    written: plan.actions,
    already: plan.already,
    manual: plan.manual,
    dropped: droppedExtras(base),
    dryRun,
    interactive,
    cancelled: false,
  }
}

/** The result of a run the user walked away from: answers kept, nothing done. */
function cancelledResult(input: {
  project: ProjectInfo
  answers: InitAnswers
  packageManager: PackageManager
  command: string
  dryRun: boolean
}): InitResult {
  return {
    project: input.project,
    answers: input.answers,
    packageManager: input.packageManager,
    install: { status: 'skipped', command: input.command },
    written: [],
    already: [],
    manual: [],
    dropped: [],
    dryRun: input.dryRun,
    /* Only an interactive run can be cancelled — there is nothing to answer
       when nobody was asked. */
    interactive: true,
    cancelled: true,
  }
}

export function frameworkDocs(framework: Framework): string {
  switch (framework) {
    case 'nuxt': return '/integrate/frameworks/nuxt'
    case 'nitro': return '/integrate/frameworks/nitro'
    case 'next': return '/integrate/frameworks/nextjs'
    case 'tanstack-start': return '/integrate/frameworks/tanstack-start'
  }
}
