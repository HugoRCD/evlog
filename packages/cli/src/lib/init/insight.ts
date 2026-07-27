import { collectProjectFacts, readPackageJson } from '../map/project-facts'
import type { ProjectFacts } from '../map/project-facts'
import { createParseCache } from '../map/parse'
import { scan } from '../map/scan'
import type { Framework, RouteEntry, ScanContext } from '../map/types'

/**
 * What `init` learned by reading the project, before it offers anything.
 *
 * The whole point of running the same analysis `map` runs: an offer backed by
 * "3 repeated errors found in your code" is a different proposition from a menu
 * item, and the seeds below turn the offer into generated code rather than a
 * blank file.
 */
export interface ProjectInsight {
  facts: ProjectFacts
  /** Sensitive entry points whose audit check failed — the audit catalog seeds. */
  auditGaps: AuditGap[]
  /** Errors written out identically in more than one file. */
  repeatedErrors: RepeatedErrorSeed[]
}

export interface AuditGap {
  /** Route path as scanned, e.g. `/api/payments/refund`. */
  path: string
  method: string | null
  file: string
  /** Why the classifier flagged it — `money`, `auth`, `pii`. */
  reasons: string[]
}

export interface RepeatedErrorSeed {
  /** Catalog key, derived from the error's own words: `CARD_DECLINED`. */
  key: string
  status?: number
  message: string
  /** The `why` the code already wrote, when it wrote one. */
  why?: string
  files: readonly string[]
}

/**
 * Run the `map` analysis for `init`'s benefit.
 *
 * Deliberately the same code path rather than a lighter approximation: two
 * analyses that disagree about what counts as an audit gap would have `init`
 * offering to fix something `map` does not report, which is worse than not
 * offering at all. Returns `null` when the scan cannot run — a project too
 * broken to parse should still be able to install evlog.
 */
export async function readProject(projectRoot: string, framework: Framework, projectName: string): Promise<ProjectInsight | null> {
  const context: ScanContext = {
    projectRoot,
    framework,
    projectName,
    hasEvlog: true,
    verbose: false,
    parse: createParseCache(),
  }

  try {
    const result = await scan(context)
    const facts = collectProjectFacts(context, { packageJson: readPackageJson(projectRoot) })

    return {
      facts,
      auditGaps: result.map.routes.filter(isAuditGap).map(toAuditGap),
      repeatedErrors: toErrorSeeds(facts),
    }
  } catch {
    return null
  }
}

function isAuditGap(route: RouteEntry): boolean {
  return route.checks.audit?.status === 'fail'
}

function toAuditGap(route: RouteEntry): AuditGap {
  return {
    path: route.path,
    method: route.method,
    file: route.file,
    /* `money: path says "checkout"` → `money`. The classifier's prose is for the
       map report; here only the category matters. */
    reasons: [...new Set(route.sensitivity.reasons.map(reason => reason.split(':')[0]!.trim()))],
  }
}

/**
 * Turn the scan's repeated-error signatures into catalog entries.
 *
 * The signature is `status=402|message=Card declined`, built from the literal
 * fields of the `createError` calls themselves — so the generated catalog is
 * the project's own errors, not a template with the names filled in.
 */
function toErrorSeeds(facts: ProjectFacts): RepeatedErrorSeed[] {
  const seeds: RepeatedErrorSeed[] = []
  const used = new Set<string>()

  for (const [signature, repeated] of facts.repeatedErrors) {
    const fields = parseSignature(signature)
    const message = fields.message ?? fields.why ?? repeated.label
    const key = uniqueKey(catalogKey(fields.code ?? message), used)
    used.add(key)

    const status = Number(fields.status ?? fields.statusCode)
    seeds.push({
      key,
      status: Number.isInteger(status) ? status : undefined,
      message,
      /* Carry over the prose the code already has. Replacing a `why` somebody
         wrote with a TODO would make the generated file worse than the inline
         error it replaces. */
      why: fields.why,
      files: repeated.files,
    })
  }

  return seeds.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

function parseSignature(signature: string): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const part of signature.split('|')) {
    const separator = part.indexOf('=')
    if (separator === -1) continue
    fields[part.slice(0, separator)] = part.slice(separator + 1)
  }
  return fields
}

/** `Card declined` → `CARD_DECLINED`, clipped to something readable. */
function catalogKey(source: string): string {
  const key = source
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
    .split('_')
    .filter(Boolean)
    .slice(0, 4)
    .join('_')
  return key.length > 0 ? key : 'UNNAMED_ERROR'
}

function uniqueKey(key: string, used: Set<string>): string {
  if (!used.has(key)) return key
  let suffix = 2
  while (used.has(`${key}_${suffix}`)) suffix++
  return `${key}_${suffix}`
}

/** `/api/payments/refund` + POST → `payment.refund`, an audit action name. */
export function auditActionName(gap: AuditGap): string {
  const segments = gap.path
    .split('/')
    .filter(segment => segment.length > 0 && segment !== 'api' && !segment.startsWith(':') && !segment.startsWith('['))
  const resource = segments.slice(-2).join('.') || 'resource'
  const verb = VERBS[gap.method ?? ''] ?? 'accessed'
  return `${resource}.${verb}`
}

const VERBS: Record<string, string> = {
  POST: 'created',
  PUT: 'updated',
  PATCH: 'updated',
  DELETE: 'deleted',
  GET: 'accessed',
  HEAD: 'accessed',
}
