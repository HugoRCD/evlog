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
    suggestions: {},
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

  it('counts a page with nothing to fetch as exempt, not dark', () => {
    const statik = route({ kind: 'page', checks: { 'page-error-handling': { status: 'n/a' } } })
    const neverRan = route({ kind: 'page', checks: {} })

    expect(classifyRouteObservability(statik)).toBe('exempt')
    expect(classifyRouteObservability(neverRan)).toBe('exempt')
  })

  it('still calls out a page that fetches without handling the failure', () => {
    const r = route({ kind: 'page', checks: { 'page-error-handling': { status: 'fail', message: 'unhandled fetch' } } })
    expect(classifyRouteObservability(r)).toBe('dark')
  })

  it('treats evlog ingest endpoints as exempt whatever their checks say', () => {
    const r = route({
      path: '/api/evlog/ingest',
      file: 'app/api/evlog/ingest/route.ts',
      checks: { 'wide-event': { status: 'fail' } },
    })
    expect(classifyRouteObservability(r)).toBe('exempt')
  })
})
