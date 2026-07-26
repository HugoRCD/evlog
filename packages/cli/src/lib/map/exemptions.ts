import type { CheckId, RawRouteEntry, RouteEntry } from './types'

/** Why an entry point is not held to some of the rules, and to which ones. */
export interface RouteExemption {
  /** Shown in the report in place of the check's verdict. */
  reason: string
  /**
   * Rules that do not apply to this route.
   *
   * `'all'` rather than a list of ids on purpose: an exemption that enumerates
   * rule ids has to be revisited every time a rule is added, and forgetting is
   * silent — the new rule simply starts failing on exempt routes.
   */
  skip: 'all' | readonly CheckId[]
}

/**
 * evlog's own ingest endpoint, as consecutive path segments.
 *
 * Matched segment by segment rather than as a substring: an exemption skips
 * every rule, so a loose match is the worst kind of bug this tool can have —
 * it silently drops a real handler out of the score instead of reporting a
 * gap. `lib/evlog/ingestable.ts` and `/api/evlog/ingestion-report` both contain
 * `evlog/ingest` and neither is evlog's endpoint.
 */
const INFRA_SEGMENTS = [
  ['evlog', 'ingest'],
  ['_evlog', 'ingest'],
]

const INFRA_EXEMPTION: RouteExemption = {
  reason: 'evlog infrastructure — client log ingest endpoint',
  skip: 'all',
}

/**
 * Segments of a route path or file, lowercased, with the extension and any
 * method suffix dropped so `_evlog/ingest.post.ts` still reads as `ingest`.
 */
function segmentsOf(value: string): string[] {
  return value
    .toLowerCase()
    .split('/')
    .filter(segment => segment.length > 0)
    .map(segment => segment.split('.')[0] ?? segment)
}

/** Whether `segments` contains `pattern` as a consecutive run. */
function containsRun(segments: readonly string[], pattern: readonly string[]): boolean {
  return segments.some((_, index) => pattern.every((name, offset) => segments[index + offset] === name))
}

/**
 * Routes that are evlog plumbing (client ingest, internal handlers) — not app
 * handlers. Observability rules are n/a, not failures.
 */
export function getRouteExemption(route: Pick<RawRouteEntry, 'path' | 'file'>): RouteExemption | null {
  const path = segmentsOf(route.path)
  const file = segmentsOf(route.file)

  for (const pattern of INFRA_SEGMENTS) {
    if (containsRun(path, pattern) || containsRun(file, pattern)) return INFRA_EXEMPTION
  }

  return null
}

/** Whether an exemption covers a given rule. */
export function isSkipped(exemption: RouteExemption, id: CheckId): boolean {
  return exemption.skip === 'all' || exemption.skip.includes(id)
}

/** Whether this entry point is evlog's own plumbing rather than app code. */
export function isInfrastructureRoute(route: Pick<RawRouteEntry, 'path' | 'file'>): boolean {
  return getRouteExemption(route) !== null
}

/** The `infra` tag for the report, or an empty string for app entry points. */
export function infrastructureLabel(route: RouteEntry): string {
  return getRouteExemption(route) ? 'infra' : ''
}
