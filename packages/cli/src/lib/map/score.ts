import type { CheckId, CheckResult, RouteEntry } from './types'
import { isInfrastructureRoute } from './exemptions'

const WEIGHTS: Partial<Record<CheckId, number>> = {
  'wide-event': 40,
  'structured-errors': 20,
  'context': 15,
  'error-handling': 15,
  'audit': 25,
  'page-error-handling': 20,
}

export function scoreRoute(checks: Partial<Record<CheckId, CheckResult>>): number {
  let score = 100
  for (const [id, result] of Object.entries(checks) as [CheckId, CheckResult][]) {
    if (result.status !== 'fail') continue
    score -= WEIGHTS[id] ?? 10
  }
  return Math.max(0, score)
}

export function scoreGlobal(routes: RouteEntry[]): number {
  if (routes.length === 0) return 100

  let totalWeight = 0
  let weightedSum = 0

  for (const route of routes) {
    let weight = 1
    if (route.sensitivity.level === 'high') weight = 2
    if (route.kind === 'page') weight = 0.5

    totalWeight += weight
    weightedSum += route.score * weight
  }

  return Math.round(weightedSum / totalWeight)
}

export function gradeFromScore(score: number): 'excellent' | 'good' | 'needs-work' | 'at-risk' {
  if (score >= 90) return 'excellent'
  if (score >= 70) return 'good'
  if (score >= 50) return 'needs-work'
  return 'at-risk'
}

export function classifyRouteObservability(route: RouteEntry): 'instrumented' | 'partial' | 'dark' | 'exempt' {
  if (isInfrastructureRoute(route)) return 'exempt'

  const { 'wide-event': wide, context } = route.checks

  if (route.kind === 'page') {
    const pageErr = route.checks['page-error-handling']
    return pageErr?.status === 'pass' ? 'instrumented' : 'dark'
  }

  if (wide?.status === 'pass' && context?.status === 'pass') return 'instrumented'
  if (wide?.status === 'pass' || context?.status === 'pass') return 'partial'
  return 'dark'
}

const CHECK_LABELS: Partial<Record<CheckId, string>> = {
  'wide-event': 'logger',
  'context': 'context',
  'structured-errors': 'errors',
  'audit': 'audit',
  'error-handling': 'catch',
  'page-error-handling': 'fetch',
}

/** Compact per-check status for terminal display, e.g. "logger ✓  context ✓  audit ✗". */
export function routeCheckChips(route: RouteEntry): string | null {
  const relevant = Object.entries(route.checks).filter(([, r]) => r?.status !== 'n/a') as [CheckId, CheckResult][]
  if (relevant.length === 0) return null

  const parts = relevant.map(([id, result]) => {
    const label = CHECK_LABELS[id] ?? id
    const mark = result.status === 'pass' ? '✓' : '✗'
    return `${label} ${mark}`
  })

  return parts.join('  ')
}

export function topIssue(route: RouteEntry): string {
  const chips = routeCheckChips(route)
  const observability = classifyRouteObservability(route)

  if (observability === 'instrumented') {
    const failed = (Object.entries(route.checks) as [CheckId, CheckResult | undefined][])
      .filter(([, c]) => c?.status === 'fail')
    if (failed.length === 0) return 'ok'
    const [id, check] = failed[0]!
    if (id === 'audit') {
      return `gap: ${check?.message ?? 'missing audit'}`
    }
    return check?.message ?? id
  }

  if (observability === 'partial') {
    return chips ?? 'partial instrumentation'
  }

  const priority: CheckId[] = ['wide-event', 'context', 'structured-errors', 'audit', 'error-handling', 'page-error-handling']
  for (const id of priority) {
    const check = route.checks[id]
    if (check?.status === 'fail') {
      return check.message ?? id
    }
  }
  return chips ?? 'ok'
}
