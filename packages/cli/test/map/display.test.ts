import { describe, expect, it } from 'vitest'
import { classifyRouteObservability, routeCheckChips, topIssue } from '../../src/lib/map/score'
import type { RouteEntry } from '../../src/lib/map/types'

function route(overrides: Partial<RouteEntry>): RouteEntry {
  return {
    id: 'test',
    framework: 'next',
    kind: 'api',
    method: 'POST',
    path: '/api/checkout',
    file: 'app/api/checkout/route.ts',
    handler: { line: 3, column: 0 },
    checks: {},
    sensitivity: { level: 'high', reasons: ['money: path'] },
    score: 75,
    ...overrides,
  }
}

describe('route display', () => {
  it('shows check chips for instrumented route with audit gap', () => {
    const r = route({
      checks: {
        'wide-event': { status: 'pass' },
        'context': { status: 'pass' },
        'audit': { status: 'fail', message: 'has logger + context but no log.audit()' },
        'structured-errors': { status: 'pass' },
        'error-handling': { status: 'pass' },
      },
    })
    expect(classifyRouteObservability(r)).toBe('instrumented')
    expect(routeCheckChips(r)).toContain('logger ✓')
    expect(routeCheckChips(r)).toContain('context ✓')
    expect(routeCheckChips(r)).toContain('audit ✗')
    expect(topIssue(r)).toContain('gap:')
  })

  it('shows dark route failure for missing logger', () => {
    const r = route({
      sensitivity: { level: 'none', reasons: [] },
      score: 45,
      checks: {
        'wide-event': { status: 'fail', message: 'no useLogger()' },
        'context': { status: 'fail', message: 'no log.set()' },
      },
    })
    expect(classifyRouteObservability(r)).toBe('dark')
    expect(topIssue(r)).toBe('no useLogger()')
  })
})
