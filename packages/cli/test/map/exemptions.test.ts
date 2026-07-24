import { describe, expect, it } from 'vitest'
import { getRouteExemption, isInfrastructureRoute } from '../../src/lib/map/exemptions'
import { classifyRouteObservability } from '../../src/lib/map/score'
import type { RouteEntry } from '../../src/lib/map/types'

describe('exemptions', () => {
  it('exempts evlog ingest routes', () => {
    const route = {
      path: '/api/evlog/ingest',
      file: 'app/api/evlog/ingest/route.ts',
    }
    expect(getRouteExemption(route)?.reason).toContain('infrastructure')
    expect(isInfrastructureRoute(route)).toBe(true)
  })

  it('does not exempt normal api routes', () => {
    expect(isInfrastructureRoute({ path: '/api/checkout', file: 'app/api/checkout/route.ts' })).toBe(false)
  })

  it('classifies exempt routes separately from dark', () => {
    const route = {
      id: 'x',
      framework: 'next' as const,
      kind: 'api' as const,
      method: 'POST',
      path: '/api/evlog/ingest',
      file: 'app/api/evlog/ingest/route.ts',
      handler: null,
      checks: { 'wide-event': { status: 'n/a' as const } },
      sensitivity: { level: 'none' as const, reasons: [] },
      score: 100,
    } satisfies RouteEntry
    expect(classifyRouteObservability(route)).toBe('exempt')
  })
})
