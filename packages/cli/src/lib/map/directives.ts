import type { Comment } from 'oxc-parser'
import type { LineIndex } from './parse'
import type { RouteEntry } from './types'

/**
 * Comment directives that turn a check off.
 *
 * Every static analyser needs an escape hatch, and it has to live next to the
 * code rather than in a config file: the reason a check does not apply is a
 * property of that handler, and it should be reviewable in the same diff.
 *
 * ```ts
 * // evlog-map-disable-next-line audit -- internal tool, no audit trail wanted
 * export default defineEventHandler(async (event) => {
 * ```
 *
 * A disabled check is reported as `n/a` with the reason attached, exactly like
 * evlog's own infrastructure exemptions, so it costs no score — and it stays
 * visible in the report rather than disappearing.
 */
const DIRECTIVE = 'evlog-map-disable'

/** Directive forms, longest first so `-next-line` is not read as bare. */
const FORMS = [
  { suffix: '-next-line', offset: 1 },
  { suffix: '-line', offset: 0 },
  { suffix: '', offset: null },
] as const

export interface Suppression {
  /** Rule ids the directive names, or `null` when it covers every rule. */
  rules: readonly string[] | null
  /** Line the directive covers, or `null` when it covers the whole file. */
  line: number | null
  /** Text after `--`, or `null` when the author gave no reason. */
  reason: string | null
  /** Line the comment itself sits on, for the message and for evidence. */
  declaredAt: number
}

/** A rule id named by a directive that no registered rule answers to. */
export interface UnknownDirectiveId {
  id: string
  declaredAt: number
}

export interface SuppressionSet {
  /** Every directive found, in source order. */
  all: readonly Suppression[]
  /** File-wide directive covering `ruleId`, if any. */
  file: (ruleId: string) => Suppression | null
  /** Directive covering `ruleId` on `line`, if any. */
  at: (ruleId: string, line: number) => Suppression | null
  /**
   * Ids named in a directive that are not in `known`.
   *
   * A typo has to be loud: silently ignoring `// evlog-map-disable-next-line
   * audti` leaves the author believing a check is off while it still fails.
   */
  unknown: (known: readonly string[]) => readonly UnknownDirectiveId[]
}

const EMPTY: SuppressionSet = {
  all: [],
  file: () => null,
  at: () => null,
  unknown: () => [],
}

/** Parse one comment body into a directive, or `null` when it is not one. */
export function parseDirective(value: string, commentLine: number): Suppression | null {
  const text = value.trim()
  if (!text.startsWith(DIRECTIVE)) return null

  const form = FORMS.find(candidate => text.startsWith(`${DIRECTIVE}${candidate.suffix}`))
  if (!form) return null

  /* Only the directive's own line matters: a block comment may span several,
     and the rest of it is prose rather than part of the reason. */
  const rest = text.slice(DIRECTIVE.length + form.suffix.length).split('\n')[0] ?? ''
  /* Anything but a separator right after the directive means this is a longer
     word — `evlog-map-disabled`, say — and not a directive at all. */
  if (rest.length > 0 && !/^[\s,]/.test(rest)) return null

  const [head = '', ...reasonParts] = rest.split('--')
  const rules = head.split(/[\s,]+/).filter(id => id.length > 0)
  const reason = reasonParts.join('--').trim()

  return {
    rules: rules.length > 0 ? rules : null,
    line: form.offset === null ? null : commentLine + form.offset,
    reason: reason.length > 0 ? reason : null,
    declaredAt: commentLine,
  }
}

/** Collect every `evlog-map-disable` directive in one parsed file. */
export function collectSuppressions(comments: readonly Comment[], lines: LineIndex): SuppressionSet {
  const all: Suppression[] = []

  for (const comment of comments) {
    const directive = parseDirective(comment.value, lines.lineAt(comment.start))
    if (directive) all.push(directive)
  }

  if (all.length === 0) return EMPTY

  const covers = (suppression: Suppression, ruleId: string): boolean =>
    suppression.rules === null || suppression.rules.includes(ruleId)

  return {
    all,
    file: ruleId => all.find(s => s.line === null && covers(s, ruleId)) ?? null,
    at: (ruleId, line) => all.find(s => s.line === line && covers(s, ruleId)) ?? null,
    unknown: (known) => {
      const seen = new Set<string>()
      const unknown: UnknownDirectiveId[] = []
      for (const suppression of all) {
        for (const id of suppression.rules ?? []) {
          if (known.includes(id) || seen.has(id)) continue
          seen.add(id)
          unknown.push({ id, declaredAt: suppression.declaredAt })
        }
      }
      return unknown
    },
  }
}

/** Checks this entry point turned off with an `evlog-map-disable` comment. */
export function countSuppressed(route: RouteEntry): number {
  return Object.values(route.checks).filter(check => check?.suppressed).length
}

/** How a disabled check reads in the report. */
export function suppressionMessage(suppression: Suppression): string {
  const scope = suppression.line === null
    ? 'disabled for this file'
    : `disabled at line ${suppression.declaredAt}`
  return suppression.reason ? `${scope} — ${suppression.reason}` : scope
}
