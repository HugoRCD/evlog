import process from 'node:process'
import {
  autocomplete,
  autocompleteMultiselect,
  cancel,
  confirm,
  intro,
  isCancel,
  log as clackLog,
  note,
  outro,
  select,
  text,
} from '@clack/prompts'
import type { CliContext } from '../../core/context'
import { DOCS_URL, createStyle } from '../../core/output'
import type { Framework } from '../map/types'
import { availableExtras, DESTINATIONS, findDestination } from './catalog'
import type { DrainId, ExtraId } from './catalog'
import type { FileAction, ManualStep } from './frameworks'
import type { PackageManager } from './pm'
import { installCommand } from './pm'

/** Every answer `init` needs, however it was obtained. */
export interface InitAnswers {
  framework: Framework
  service: string
  drain: DrainId
  extras: ExtraId[]
  /** Run the package manager for a missing `evlog`. */
  install: boolean
}

/** Thrown when the user aborts a prompt — the command exits quietly, writing nothing. */
export class InitCancelled extends Error {
  constructor() {
    super('cancelled')
    this.name = 'InitCancelled'
  }
}

/**
 * Unwrap a clack answer, turning a cancel into a throw.
 *
 * Every prompt has to handle Ctrl-C, and doing it at each call site is how one
 * gets forgotten and the run continues with `Symbol(clack:cancel)` as the
 * service name.
 */
function required<T>(value: T | symbol): T {
  if (isCancel(value)) throw new InitCancelled()
  return value as T
}

const FRAMEWORK_LABELS: Record<Framework, string> = {
  'nuxt': 'Nuxt',
  'nitro': 'Nitro',
  'next': 'Next.js',
  'tanstack-start': 'TanStack Start',
}

export interface PromptContext {
  ctx: CliContext
  detected: Framework
  /** Detection was a guess rather than a match — ask instead of announcing. */
  uncertain: boolean
  defaultService: string
  evlogInstalled: boolean
  /** Whether `--install` is still on — `--no-install` is an answer, not a prompt. */
  installRequested: boolean
  packageManager: PackageManager
}

export function openInteractive(ctx: CliContext, projectLabel: string): void {
  const { paint } = createStyle(ctx)
  intro(`${paint(['bold', 'cyan'], ' evlog init ')} ${paint('dim', projectLabel)}`)
}

/**
 * Ask everything, in the order a person thinks about it: what am I, what am I
 * called, where do the events go, what else do I want.
 */
export async function askAnswers(input: PromptContext): Promise<InitAnswers> {
  const framework = input.uncertain
    ? required(await select<Framework>({
      message: 'Which framework is this?',
      options: (Object.keys(FRAMEWORK_LABELS) as Framework[]).map(id => ({
        value: id,
        label: FRAMEWORK_LABELS[id],
      })),
      initialValue: input.detected,
    }))
    : input.detected

  if (!input.uncertain) {
    clackLog.step(`Detected ${FRAMEWORK_LABELS[framework]}`)
  }

  const service = required(await text({
    message: 'Service name on every wide event',
    placeholder: input.defaultService,
    defaultValue: input.defaultService,
    validate(value) {
      /* Empty means "take the default", which clack fills in afterwards. */
      if (value !== undefined && value.length > 0 && !/^[\w.-]+$/.test(value)) {
        return 'Letters, numbers, dot, dash and underscore only — it ends up in a log field'
      }
      return undefined
    },
  }))

  const drain = required(await autocomplete<DrainId>({
    message: 'Where should wide events go?',
    placeholder: 'Type to search — local files, Axiom, OTLP, Sentry…',
    options: DESTINATIONS.map(destination => ({
      value: destination.id,
      label: destination.label,
      hint: destination.hint,
    })),
    initialValue: 'fs',
  }))

  const offered = availableExtras(framework, drain)
  const extras = offered.length === 0
    ? []
    : required(await autocompleteMultiselect<ExtraId>({
      message: 'Anything else? (space to select, enter to confirm)',
      placeholder: 'Type to filter — nothing is selected by default',
      options: offered.map(extra => ({
        value: extra.id,
        label: extra.label,
        hint: extra.hint,
      })),
      initialValues: [],
      required: false,
    }))

  /* Not a question of its own: the plan lists `run pnpm add evlog` and asks
     once for everything. Two confirmations for one decision is how a flow
     starts feeling like paperwork — and asking after `--no-install` was passed
     is asking someone to repeat themselves. */
  return {
    framework,
    service: service || input.defaultService,
    drain,
    extras,
    install: !input.evlogInstalled && input.installRequested,
  }
}

/**
 * Show the exact file list and ask before writing.
 *
 * The point of the whole flow: nothing lands until the user has read what is
 * about to land. A setup command that writes first and reports after is one the
 * user has to undo with git rather than with an answer.
 */
export async function confirmPlan(
  actions: FileAction[],
  already: string[],
  installing: boolean,
  packageManager: PackageManager,
): Promise<boolean> {
  const lines: string[] = []

  if (installing) lines.push(`run  ${installCommand(packageManager)}`)
  for (const action of actions) {
    lines.push(`${action.kind === 'create' ? 'create' : 'update'}  ${action.relative}`)
  }
  for (const entry of already) lines.push(`skip  ${entry}`)

  if (lines.length === 0) {
    note('Everything is already wired.', 'Nothing to do')
    return false
  }

  note(lines.join('\n'), 'Plan')

  return required(await confirm({ message: 'Apply?', initialValue: true }))
}

/** Environment variables the chosen destination reads, printed once at the end. */
export function noteEnvironment(drain: DrainId): void {
  const destination = findDestination(drain)
  if (!destination || destination.env.length === 0) return

  /* Deliberately not prompted for. A setup command that asks for an API token
     is a setup command that writes a secret into a file it chose, and the
     answer scrolls into the terminal history either way. */
  note(
    destination.env.map(variable => `${variable.name}    ${variable.hint}`).join('\n'),
    `Set these before ${destination.label} receives anything`,
  )
}

export function noteManual(steps: ManualStep[]): void {
  for (const step of steps) {
    note(`${step.snippet}\n\n${step.reason}`, `${step.title} — ${step.file}`)
  }
}

export function closeInteractive(ctx: CliContext, framework: Framework, docsPath: string): void {
  const { paint } = createStyle(ctx)
  clackLog.message(`${paint('dim', 'verify')}  evlog doctor`)
  clackLog.message(`${paint('dim', 'score ')}  evlog map`)
  outro(`${FRAMEWORK_LABELS[framework]} wired · ${DOCS_URL}${docsPath}`)
}

export function closeCancelled(): void {
  cancel('Cancelled — nothing was written.')
}

/**
 * Whether prompting is possible and wanted.
 *
 * Non-interactive is the default whenever anything suggests nobody is watching:
 * no TTY, a CI environment, `--json`, or an explicit `--yes`. An agent running
 * this command must never end up waiting on a keystroke that is not coming.
 */
export function canPrompt(ctx: CliContext): boolean {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false
  if (ctx.env.CI !== undefined && ctx.env.CI !== 'false' && ctx.env.CI !== '0') return false
  return true
}
