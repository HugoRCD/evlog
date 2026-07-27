import { cliErrors } from '../errors'
import type { Framework } from '../map/types'
import { availableExtras, DESTINATIONS, EXTRAS, findDestination, findExtra } from './catalog'
import type { DrainId, ExtraId } from './catalog'
import type { InitAnswers } from './prompts'

/** Raw `--drain` / `--extras` values, before they are known to be real. */
export interface AnswerFlags {
  drain?: unknown
  extras?: unknown
  service?: unknown
}

const DRAIN_IDS = DESTINATIONS.map(destination => destination.id).join(', ')
const EXTRA_IDS = EXTRAS.map(extra => extra.id).join(', ')

/**
 * Read `--drain`, rejecting an id the catalog does not know.
 *
 * A misspelled destination has to stop the command. Falling back to the default
 * would wire the local file drain into an app whose author asked for Axiom, and
 * they would find out when production told them nothing.
 */
export function parseDrainArg(value: unknown): DrainId | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  const destination = findDestination(value)
  if (!destination) throw cliErrors.INIT_INVALID_DRAIN({ value, known: DRAIN_IDS })
  return destination.id
}

/** Read `--extras a,b`, rejecting unknown ids the same way. */
export function parseExtrasArg(value: unknown): ExtraId[] | undefined {
  if (value === false) return []
  if (typeof value !== 'string' || value.length === 0) return undefined

  const ids = value.split(',').map(entry => entry.trim()).filter(Boolean)
  const parsed: ExtraId[] = []
  for (const id of ids) {
    const extra = findExtra(id)
    if (!extra) throw cliErrors.INIT_INVALID_EXTRA({ value: id, known: EXTRA_IDS })
    if (!parsed.includes(extra.id)) parsed.push(extra.id)
  }
  return parsed
}

export interface ResolveInput {
  framework: Framework
  defaultService: string
  evlogInstalled: boolean
  /** `--install` (default true); irrelevant when evlog is already there. */
  install: boolean
  drain?: DrainId
  extras?: ExtraId[]
  service?: string
}

/**
 * The answers a non-interactive run uses: flags first, then defaults.
 *
 * Same shape the prompts produce, so everything downstream — the plan, the
 * writes, the report — has one code path. `--drain fs` and picking "Local
 * files" in the picker are the same run.
 */
export function resolveAnswers(input: ResolveInput): InitAnswers {
  const drain = input.drain ?? 'fs'
  const requested = input.extras ?? []

  /* An extra that does not apply is dropped rather than refused: `--extras
     vite,enrichers` across a monorepo of mixed frameworks should wire what fits
     each app instead of failing on the one that does not. */
  const applicable = new Set(availableExtras(input.framework, drain).map(extra => extra.id))

  return {
    framework: input.framework,
    service: input.service ?? input.defaultService,
    drain,
    extras: requested.filter(id => applicable.has(id)),
    install: input.evlogInstalled ? false : input.install,
  }
}

/** Extras asked for that this framework and drain cannot use — reported, not applied. */
export function droppedExtras(input: ResolveInput): ExtraId[] {
  const drain = input.drain ?? 'fs'
  const applicable = new Set(availableExtras(input.framework, drain).map(extra => extra.id))
  return (input.extras ?? []).filter(id => !applicable.has(id))
}
