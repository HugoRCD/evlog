import { describe, expect, it } from 'vitest'
import type { EnrichContext, WideEvent } from 'evlog'
import { createTenantEnricher } from '../src/index'

const baseEvent = (): WideEvent => ({
  timestamp: '2030-01-01T00:00:00.000Z',
  level: 'info',
  service: 'shop',
  environment: 'test',
})

const ctx = (event: WideEvent, headers: Record<string, string>): EnrichContext => ({
  event,
  headers,
} as EnrichContext)

describe('createTenantEnricher', () => {
  it('sets `tenant` from default headers', () => {
    const enrich = createTenantEnricher()
    const event = baseEvent()
    enrich(ctx(event, {
      'x-tenant-id': 'acme-1',
      'x-tenant-org': 'Acme Inc',
      'x-tenant-plan': 'pro',
    }))
    expect(event.tenant).toEqual({ id: 'acme-1', org: 'Acme Inc', plan: 'pro' })
  })

  it('respects custom header names', () => {
    const enrich = createTenantEnricher({ headerName: 'x-org-id' })
    const event = baseEvent()
    enrich(ctx(event, { 'x-org-id': 'foo' }))
    expect(event.tenant).toEqual({ id: 'foo', org: undefined, plan: undefined })
  })

  it('skips when the id header is missing', () => {
    const enrich = createTenantEnricher()
    const event = baseEvent()
    enrich(ctx(event, {}))
    expect(event.tenant).toBeUndefined()
  })

  it('preserves user-provided fields by default', () => {
    const enrich = createTenantEnricher()
    const event = { ...baseEvent(), tenant: { id: 'manual', plan: 'enterprise' } }
    enrich(ctx(event, { 'x-tenant-id': 'auto' }))
    // overwrite defaults to false → manual id wins, missing fields fill in.
    expect(event.tenant).toEqual({ id: 'manual', plan: 'enterprise' })
  })

  it('overwrites when overwrite=true', () => {
    const enrich = createTenantEnricher({ overwrite: true })
    const event = { ...baseEvent(), tenant: { id: 'manual' } }
    enrich(ctx(event, { 'x-tenant-id': 'auto' }))
    expect(event.tenant).toEqual({ id: 'auto', org: undefined, plan: undefined })
  })
})
