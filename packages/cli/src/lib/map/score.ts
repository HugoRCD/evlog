import type { CheckId, CheckResult, RouteEntry } from './types'
import { isInfrastructureRoute } from './exemptions'
import { REQUIREMENTS, getRule } from './rules/index'

/** Fallback weight for a rule id that is not in the registry. */
const UNKNOWN_WEIGHT = 10

/**
 * Score one entry point from its requirement results.
 *
 * Opportunities are deliberately unreachable from here: they live in
 * `route.suggestions`, and their type carries no weight to subtract.
 */
export function scoreRoute(checks: Partial<Record<CheckId, CheckResult>>): number {
  let score = 100
  for (const [id, result] of Object.entries(checks) as [CheckId, CheckResult][]) {
    if (result.status !== 'fail') continue
    const rule = getRule(id)
    if (rule && rule.category !== 'requirement') continue
    score -= rule?.category === 'requirement' ? rule.weight : UNKNOWN_WEIGHT
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

/** Compact per-rule status for terminal display, e.g. "logger ✓  context ✓  audit ✗". */
export function routeCheckChips(route: RouteEntry): string | null {
  const relevant = Object.entries(route.checks).filter(([, r]) => r?.status !== 'n/a') as [CheckId, CheckResult][]
  if (relevant.length === 0) return null

  const parts = relevant.map(([id, result]) => {
    const label = getRule(id)?.title ?? id
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

  /* Registry order is report order: the heaviest gap is named first. */
  for (const rule of REQUIREMENTS) {
    const check = route.checks[rule.id]
    if (check?.status === 'fail') {
      return check.message ?? rule.id
    }
  }
  return chips ?? 'ok'
}
