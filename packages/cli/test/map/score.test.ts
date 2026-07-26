import { describe, expect, it } from 'vitest'
import { gradeFromScore, scoreGlobal, scoreRoute } from '../../src/lib/map/score'
import type { CheckResult, RouteEntry } from '../../src/lib/map/types'

describe('score', () => {
  it('subtracts weights for failed checks', () => {
    const checks: Record<string, CheckResult> = {
      'wide-event': { status: 'fail' },
      'context': { status: 'pass' },
    }
    expect(scoreRoute(checks)).toBe(60)
  })

  it('computes weighted global score', () => {
    const routes = [
      { score: 100, sensitivity: { level: 'none', reasons: [] }, kind: 'api' },
      { score: 50, sensitivity: { level: 'high', reasons: ['money'] }, kind: 'api' },
    ] as RouteEntry[]
    expect(scoreGlobal(routes)).toBe(67)
  })

  it('maps grades', () => {
    expect(gradeFromScore(95)).toBe('excellent')
    expect(gradeFromScore(75)).toBe('good')
    expect(gradeFromScore(55)).toBe('needs-work')
    expect(gradeFromScore(30)).toBe('at-risk')
  })
})
