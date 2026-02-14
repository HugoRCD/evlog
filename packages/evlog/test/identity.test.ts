// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearIdentity, initLog, log, setIdentity } from '../src/runtime/client/log'

describe('client identity', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))
    initLog({ enabled: true, transport: { enabled: true, endpoint: '/api/_evlog/ingest' } })
    clearIdentity()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    clearIdentity()
  })

  function getLastSentEvent(): Record<string, unknown> {
    const [, options] = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1] as [string, RequestInit]
    return JSON.parse(options.body as string)
  }

  it('includes identity fields in emitted events', () => {
    setIdentity({ userId: 'usr_123' })
    log.info({ action: 'click' })

    const event = getLastSentEvent()
    expect(event.userId).toBe('usr_123')
    expect(event.action).toBe('click')
  })

  it('clearIdentity removes identity fields', () => {
    setIdentity({ userId: 'usr_123' })
    clearIdentity()
    log.info({ action: 'click' })

    const event = getLastSentEvent()
    expect(event.userId).toBeUndefined()
  })

  it('per-event fields override identity fields', () => {
    setIdentity({ userId: 'usr_123' })
    log.info({ userId: 'usr_override' })

    const event = getLastSentEvent()
    expect(event.userId).toBe('usr_override')
  })

  it('identity works with tagged logs', () => {
    setIdentity({ userId: 'usr_123' })
    log.info('auth', 'user logged in')

    const event = getLastSentEvent()
    expect(event.userId).toBe('usr_123')
    expect(event.tag).toBe('auth')
    expect(event.message).toBe('user logged in')
  })

  it('supports multiple identity fields', () => {
    setIdentity({ userId: 'usr_123', orgId: 'org_456', role: 'admin' })
    log.info({ action: 'click' })

    const event = getLastSentEvent()
    expect(event.userId).toBe('usr_123')
    expect(event.orgId).toBe('org_456')
    expect(event.role).toBe('admin')
  })

  it('setIdentity replaces previous identity', () => {
    setIdentity({ userId: 'usr_123', orgId: 'org_456' })
    setIdentity({ userId: 'usr_789' })
    log.info({ action: 'click' })

    const event = getLastSentEvent()
    expect(event.userId).toBe('usr_789')
    expect(event.orgId).toBeUndefined()
  })
})
