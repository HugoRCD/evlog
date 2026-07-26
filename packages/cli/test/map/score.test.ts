import { describe, expect, it } from 'vitest'
import { getRule } from '../../src/lib/map/rules/index'
import { gradeFromScore, scoreGlobal, scoreRoute } from '../../src/lib/map/score'
import type { CheckResult, RouteEntry } from '../../src/lib/map/types'

/** Asked of the registry rather than hard-coded: a weight change must not read as a scoring bug. */
function weightOf(id: 'wide-event' | 'context'): number {
  const rule = getRule(id)
  if (!rule || rule.category !== 'requirement') throw new Error(`${id} is not a requirement`)
  return rule.weight
}

describe('score', () => {
  it('subtracts weights for failed checks', () => {
    const checks: Record<string, CheckResult> = {
      'wide-event': { status: 'fail' },
      'context': { status: 'pass' },
    }
    expect(scoreRoute(checks)).toBe(100 - weightOf('wide-event'))
  })

  it('never goes below zero', () => {
    const checks = Object.fromEntries(
      (['wide-event', 'context'] as const).map(id => [id, { status: 'fail' } as CheckResult]),
    )
    expect(scoreRoute({ ...checks, unknown: { status: 'fail' } } as Record<string, CheckResult>))
      .toBeGreaterThanOrEqual(0)
  })

  it('computes weighted global score', () => {
    const routes = [
      { score: 100, sensitivity: { level: 'none', reasons: [] }, kind: 'api' },
      { score: 50, sensitivity: { level: 'high', reasons: ['money'] }, kind: 'api' },
    ] as RouteEntry[]
    expect(scoreGlobal(routes)).toBe(67)
  })

  it('weighs a page as a page even when it is sensitive', () => {
    const routes = [
      { score: 100, sensitivity: { level: 'none', reasons: [] }, kind: 'api' },
      { score: 0, sensitivity: { level: 'high', reasons: ['money'] }, kind: 'page' },
    ] as RouteEntry[]
    /* 0.5 for the page, not 2 for the sensitivity: (100×1 + 0×0.5) / 1.5. */
    expect(scoreGlobal(routes)).toBe(67)
  })

  it('scores an empty project as perfect rather than dividing by zero', () => {
    expect(scoreGlobal([])).toBe(100)
  })

  it.each([
    [100, 'excellent'],
    [90, 'excellent'],
    [89, 'good'],
    [70, 'good'],
    [69, 'needs-work'],
    [50, 'needs-work'],
    [49, 'at-risk'],
    [0, 'at-risk'],
  ])('grades %i as %s', (score, grade) => {
    expect(gradeFromScore(score)).toBe(grade)
  })
})
