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

const INFRA_PATHS = [
  '/evlog/ingest',
  '/_evlog/ingest',
  '/api/evlog/ingest',
]

const INFRA_FILE_PATTERNS = [
  'evlog/ingest',
  '_evlog/ingest',
]

const INFRA_EXEMPTION: RouteExemption = {
  reason: 'evlog infrastructure — client log ingest endpoint',
  skip: 'all',
}

/**
 * Routes that are evlog plumbing (client ingest, internal handlers) — not app
 * handlers. Observability rules are n/a, not failures.
 */
export function getRouteExemption(route: Pick<RawRouteEntry, 'path' | 'file'>): RouteExemption | null {
  const path = route.path.toLowerCase()
  const file = route.file.toLowerCase()

  if (INFRA_PATHS.some(pattern => path.includes(pattern))) return INFRA_EXEMPTION
  if (INFRA_FILE_PATTERNS.some(pattern => file.includes(pattern))) return INFRA_EXEMPTION

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
