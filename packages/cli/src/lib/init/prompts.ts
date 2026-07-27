import process from 'node:process'
import {
  autocomplete,
  autocompleteMultiselect,
  cancel,
  confirm,
  groupMultiselect,
  intro,
  isCancel,
  log as clackLog,
  multiselect,
  note,
  outro,
  select,
  tasks,
  text,
} from '@clack/prompts'
import type { CliContext } from '../../core/context'
import { DOCS_URL, createStyle } from '../../core/output'
import type { Framework } from '../map/types'
import {
  availableExtras,
  DEFAULT_ENRICHERS,
  DEV_DESTINATIONS,
  ENRICHERS,
  findDestination,
  offerEvidence,
  PROD_DESTINATIONS,
  SAMPLING_PRESETS,
} from './catalog'
import type { DrainId, EnricherId, ExtraGroup, ExtraId, OfferContext, SamplingProfile } from './catalog'
import type { FileAction, ManualStep } from './frameworks'
import type { PackageManager } from './pm'
import { installCommand } from './pm'

/** Every answer `init` needs, however it was obtained. */
export interface InitAnswers {
  framework: Framework
  service: string
  /** Local sink: `fs` or `none`. */
  devDrain: DrainId
  /** Production destinations — more than one fans the same event out to each. */
  prodDrains: DrainId[]
  extras: ExtraId[]
  enrichers: EnricherId[]
  sampling: SamplingProfile
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
  /** Builds the offer list once the destinations are known. */
  offers: (prodDrains: DrainId[], framework: Framework) => OfferContext
}

export function openInteractive(ctx: CliContext, projectLabel: string): void {
  const { paint } = createStyle(ctx)
  intro(`${paint(['bold', 'cyan'], ' evlog init ')} ${paint('dim', projectLabel)}`)
}

/**
 * Ask everything, in the order a person thinks about it: what am I, what am I
 * called, where do events go here, where do they go in production, what else.
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

  /* Two questions rather than one list: nobody sends local development traffic
     to Axiom, and nobody reads production logs off the box's filesystem. Asking
     "where do events go" once forces one answer onto two different problems. */
  const devDrain = required(await select<DrainId>({
    message: 'In development, where should events go?',
    options: DEV_DESTINATIONS.map(destination => ({
      value: destination.id,
      label: destination.label,
      hint: destination.hint,
    })),
    initialValue: 'fs' as DrainId,
  }))

  const prodDrains = required(await autocompleteMultiselect<DrainId>({
    message: 'And in production?',
    placeholder: 'Type to search — leave empty to decide later',
    options: PROD_DESTINATIONS.map(destination => ({
      value: destination.id,
      label: destination.label,
      hint: destination.hint,
    })),
    initialValues: [],
    required: false,
  }))

  const offered = availableExtras(input.offers(prodDrains, framework))
  const context = input.offers(prodDrains, framework)

  let extras: ExtraId[] = []
  if (offered.length > 0) {
    /* Grouped rather than flat: eight options under one heading is a list to
       get through, the same eight under four headings is a set of decisions. */
    const groups: Record<string, { value: ExtraId, label: string, hint?: string }[]> = {}
    for (const extra of offered) {
      const evidence = offerEvidence(extra, context)
      const { group } = extra
      groups[group] ??= []
      groups[group]!.push({
        value: extra.id,
        /* The evidence goes in the label, not the hint: a grouped multiselect
           only renders the hint of the focused row, and "3 repeated errors
           found" is the whole reason the row is there. */
        label: evidence ? `${extra.label} · ${evidence}` : extra.label,
        hint: extra.hint,
      })
    }

    extras = required(await groupMultiselect<ExtraId>({
      message: 'Anything else?',
      options: groups,
      initialValues: [],
      required: false,
      selectableGroups: false,
    }))
  }

  const enrichers = extras.includes('enrichers')
    ? required(await multiselect<EnricherId>({
      message: 'Which enrichers?',
      options: ENRICHERS.map(enricher => ({
        value: enricher.id,
        label: enricher.label,
        hint: enricher.hint,
      })),
      initialValues: [...DEFAULT_ENRICHERS],
      required: false,
    }))
    : []

  const sampling = extras.includes('sampling')
    ? required(await select<SamplingProfile>({
      message: 'How much traffic should reach the drain?',
      options: SAMPLING_PRESETS.map(preset => ({
        value: preset.id,
        label: preset.label,
        hint: preset.hint,
      })),
      initialValue: 'balanced' as SamplingProfile,
    }))
    : 'all'

  /* Installing is not a question of its own: the plan lists `pnpm add evlog`
     and asks once for everything. Two confirmations for one decision is how a
     flow starts feeling like paperwork — and asking after `--no-install` was
     passed is asking someone to repeat themselves. */
  return {
    framework,
    service: service || input.defaultService,
    devDrain,
    prodDrains,
    extras: extras.filter(id => id !== 'enrichers' || enrichers.length > 0),
    enrichers,
    sampling,
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

/** Environment variables the chosen destinations read, printed once at the end. */
export function noteEnvironment(prodDrains: DrainId[]): void {
  const variables = prodDrains
    .map(id => findDestination(id))
    .flatMap(destination => destination?.env.map(variable => ({ ...variable, label: destination.label })) ?? [])
  if (variables.length === 0) return

  /* Deliberately not prompted for. A setup command that asks for an API token
     is a setup command that writes a secret into a file it chose, and the
     answer scrolls into the terminal history either way. */
  const width = Math.max(...variables.map(variable => variable.name.length))
  note(
    variables.map(variable => `${variable.name.padEnd(width)}  ${variable.hint}`).join('\n'),
    'Set these before anything is received',
  )
}

export function noteManual(steps: ManualStep[]): void {
  for (const step of steps) {
    note(`${step.snippet}\n\n${step.reason}`, `${step.title} — ${step.file}`)
  }
}

/**
 * Run the verification step in the same session.
 *
 * The real question after a setup is "did it work", and answering it with
 * "now run this other command" is leaving the job half done.
 */
export async function runVerification(verify: () => Promise<string>): Promise<void> {
  await tasks([
    {
      title: 'Verifying the install',
      task: async () => await verify(),
    },
  ])
}

export function closeInteractive(ctx: CliContext, framework: Framework, docsPath: string): void {
  const { paint } = createStyle(ctx)
  clackLog.message(`${paint('dim', 'score')}  evlog map`)
  outro(`${FRAMEWORK_LABELS[framework]} wired · ${DOCS_URL}${docsPath}`)
}

export function closeCancelled(): void {
  cancel('Cancelled — nothing was written.')
}

/** Ask which workspace packages to set up. */
export async function askWorkspaceTargets(
  candidates: { name: string, dir: string, framework: Framework }[],
): Promise<string[]> {
  return required(await multiselect<string>({
    message: 'Which apps should be set up?',
    options: candidates.map(candidate => ({
      value: candidate.dir,
      label: candidate.name,
      hint: FRAMEWORK_LABELS[candidate.framework],
    })),
    initialValues: candidates.map(candidate => candidate.dir),
    required: true,
  }))
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
