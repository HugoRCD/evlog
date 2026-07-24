import type { CheckId, RawRouteEntry, RouteEntry } from './types'

export interface RouteExemption {
  reason: string
  /** Observability checks that do not apply to this route. */
  skipChecks: CheckId[]
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

/**
 * Routes that are evlog plumbing (client ingest, internal handlers) — not app handlers.
 * Observability checks are n/a, not failures.
 */
export function getRouteExemption(route: Pick<RawRouteEntry, 'path' | 'file'>): RouteExemption | null {
  const path = route.path.toLowerCase()
  const file = route.file.toLowerCase()

  for (const pattern of INFRA_PATHS) {
    if (path.includes(pattern)) {
      return {
        reason: 'evlog infrastructure — client log ingest endpoint',
        skipChecks: ['wide-event', 'context', 'audit', 'structured-errors', 'error-handling'],
      }
    }
  }

  for (const pattern of INFRA_FILE_PATTERNS) {
    if (file.includes(pattern)) {
      return {
        reason: 'evlog infrastructure — client log ingest endpoint',
        skipChecks: ['wide-event', 'context', 'audit', 'structured-errors', 'error-handling'],
      }
    }
  }

  return null
}

export function isInfrastructureRoute(route: Pick<RawRouteEntry, 'path' | 'file'>): boolean {
  return getRouteExemption(route) !== null
}

export function shouldSkipCheck(route: Pick<RawRouteEntry, 'path' | 'file'>, checkId: CheckId): RouteExemption | null {
  const exemption = getRouteExemption(route)
  if (!exemption) return null
  if (exemption.skipChecks.includes(checkId)) return exemption
  return null
}

export function infrastructureLabel(route: RouteEntry): string {
  const exemption = getRouteExemption(route)
  return exemption ? 'infra' : ''
}
