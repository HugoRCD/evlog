import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUDIT_SCHEMA_VERSION,
  AuditDeniedError,
  audit,
  auditDiff,
  auditEnricher,
  auditOnly,
  auditRedactPreset,
  buildAuditFields,
  defineAuditAction,
  mockAudit,
  signed,
  withAudit,
  withAuditMethods,
} from '../src/audit'
import type { AuditFields, DrainContext, EnrichContext, WideEvent } from '../src/types'
import { createLogger, createRequestLogger, initLogger } from '../src/logger'
import { resolveRedactConfig } from '../src/redact'

function createDrainCtx(event: Partial<WideEvent> = {}): DrainContext {
  const wide: WideEvent = {
    timestamp: new Date('2026-04-24T12:00:00.000Z').toISOString(),
    level: 'info',
    service: 'test',
    environment: 'test',
    ...event,
  }
  return { event: wide }
}

function createEnrichCtx(event: Partial<WideEvent> = {}, headers?: Record<string, string>, requestId?: string): EnrichContext {
  const wide: WideEvent = {
    timestamp: new Date().toISOString(),
    level: 'info',
    service: 'test',
    environment: 'test',
    ...event,
  }
  return {
    event: wide,
    headers,
    request: requestId ? { path: '/x', requestId } : undefined,
  }
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  initLogger({ pretty: false, redact: false })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('buildAuditFields', () => {
  it('defaults outcome to success and version to AUDIT_SCHEMA_VERSION', () => {
    const fields = buildAuditFields({
      action: 'invoice.refund',
      actor: { type: 'user', id: 'u1' },
    })
    expect(fields.outcome).toBe('success')
    expect(fields.version).toBe(AUDIT_SCHEMA_VERSION)
  })

  it('preserves explicit outcome and version', () => {
    const fields = buildAuditFields({
      action: 'invoice.refund',
      actor: { type: 'system', id: 'cron' },
      outcome: 'failure',
      version: 2,
    })
    expect(fields.outcome).toBe('failure')
    expect(fields.version).toBe(2)
  })
})

describe('log.audit() on createLogger', () => {
  it('attaches audit fields and force-keeps the event past tail sampling', () => {
    initLogger({ pretty: false, redact: false, sampling: { rates: { info: 0 } } })
    const log = createLogger()
    log.audit?.({
      action: 'invoice.refund',
      actor: { type: 'user', id: 'u1' },
      target: { type: 'invoice', id: 'inv_1' },
    })
    const event = log.emit()
    expect(event).not.toBeNull()
    const audit = event!.audit as AuditFields
    expect(audit.action).toBe('invoice.refund')
    expect(audit.outcome).toBe('success')
    expect(audit.idempotencyKey).toMatch(/^[\da-f]{32}$/)
  })

  it('log.audit.deny() sets outcome to denied and records reason', () => {
    const log = createLogger()
    log.audit?.deny('Insufficient permissions', {
      action: 'invoice.refund',
      actor: { type: 'user', id: 'u1' },
      target: { type: 'invoice', id: 'inv_1' },
    })
    const event = log.emit()
    const audit = event!.audit as AuditFields
    expect(audit.outcome).toBe('denied')
    expect(audit.reason).toBe('Insufficient permissions')
  })

  it('falls back to set+emit when log.set({ audit }) is used directly', () => {
    initLogger({ pretty: false, redact: false, sampling: { rates: { info: 0 } } })
    const log = createLogger()
    log.set({ audit: buildAuditFields({ action: 'manual', actor: { type: 'system', id: 's' } }) })
    const event = log.emit()
    expect(event).not.toBeNull()
    expect((event!.audit as AuditFields).action).toBe('manual')
  })

  it('createRequestLogger exposes the same audit method', () => {
    const log = createRequestLogger({ method: 'POST', path: '/x' })
    expect(typeof log.audit).toBe('function')
  })
})

describe('standalone audit()', () => {
  it('emits an event tagged as audit and returns it', () => {
    const event = audit({
      action: 'cron.cleanup',
      actor: { type: 'system', id: 'cron' },
    })
    expect(event).not.toBeNull()
    expect((event!.audit as AuditFields).action).toBe('cron.cleanup')
  })

  it('is force-kept even when info sampling is at 0%', () => {
    initLogger({ pretty: false, redact: false, sampling: { rates: { info: 0 } } })
    const event = audit({
      action: 'cron.cleanup',
      actor: { type: 'system', id: 'cron' },
    })
    expect(event).not.toBeNull()
  })
})

describe('withAudit()', () => {
  it('records success when fn resolves', async () => {
    const collector = mockAudit()
    const refund = withAudit(
      { action: 'invoice.refund', target: input => ({ type: 'invoice', id: (input as { id: string }).id }) },
      (input: { id: string }) => `refunded ${input.id}`,
    )
    await refund({ id: 'inv_1' }, { actor: { type: 'user', id: 'u1' } })
    expect(collector.events).toHaveLength(1)
    expect(collector.events[0]!.outcome).toBe('success')
    expect(collector.events[0]!.target).toEqual({ type: 'invoice', id: 'inv_1' })
    collector.restore()
  })

  it('records denied when fn throws AuditDeniedError', async () => {
    const collector = mockAudit()
    const fn = withAudit({ action: 'x' }, () => {
      throw new AuditDeniedError('not allowed')
    })
    await expect(fn(null, { actor: { type: 'user', id: 'u1' } })).rejects.toThrow('not allowed')
    expect(collector.events[0]!.outcome).toBe('denied')
    expect(collector.events[0]!.reason).toBe('not allowed')
    collector.restore()
  })

  it('records denied when fn throws a 403-status error', async () => {
    const collector = mockAudit()
    const fn = withAudit({ action: 'x' }, () => {
      const err = new Error('forbidden') as Error & { status: number }
      err.status = 403
      throw err
    })
    await expect(fn(null, { actor: { type: 'user', id: 'u1' } })).rejects.toThrow('forbidden')
    expect(collector.events[0]!.outcome).toBe('denied')
    collector.restore()
  })

  it('records failure for other thrown errors', async () => {
    const collector = mockAudit()
    const fn = withAudit({ action: 'x' }, () => {
      throw new Error('boom')
    })
    await expect(fn(null, { actor: { type: 'user', id: 'u1' } })).rejects.toThrow('boom')
    expect(collector.events[0]!.outcome).toBe('failure')
    expect(collector.events[0]!.reason).toBe('boom')
    collector.restore()
  })
})

describe('auditDiff()', () => {
  it('produces a JSON Patch with replace operations', () => {
    const diff = auditDiff({ amount: 100, currency: 'USD' }, { amount: 200, currency: 'USD' })
    expect(diff.patch).toEqual([{ op: 'replace', path: '/amount', value: 200 },])
  })

  it('redacts paths matching key names', () => {
    const diff = auditDiff(
      { user: { name: 'A', password: 'old' } },
      { user: { name: 'B', password: 'new' } },
      { redactPaths: ['password'] },
    )
    expect(diff.patch).toContainEqual({ op: 'replace', path: '/user/name', value: 'B' })
    expect(diff.patch).toContainEqual({ op: 'replace', path: '/user/password', value: '[REDACTED]' })
  })

  it('emits add and remove operations', () => {
    const diff = auditDiff({ a: 1 }, { b: 2 })
    expect(diff.patch).toEqual(expect.arrayContaining([
      { op: 'remove', path: '/a' },
      { op: 'add', path: '/b', value: 2 },
    ]))
  })
})

describe('defineAuditAction()', () => {
  it('curries the action and infers target type', () => {
    const refund = defineAuditAction('invoice.refund', { target: 'invoice' as const })
    const built = refund({
      actor: { type: 'user', id: 'u1' },
      target: { id: 'inv_1' },
    })
    expect(built.action).toBe('invoice.refund')
    expect(built.target).toEqual({ type: 'invoice', id: 'inv_1' })
  })
})

describe('mockAudit()', () => {
  it('captures audit events from log.audit() and audit()', () => {
    const captured = mockAudit()
    audit({ action: 'a', actor: { type: 'system', id: 's' } })
    expect(captured.events).toHaveLength(1)
    expect(captured.toIncludeAuditOf({ action: 'a' })).toBe(true)
    expect(captured.toIncludeAuditOf({ action: 'missing' })).toBe(false)
    captured.restore()
  })

  it('matcher supports regex actions', () => {
    const captured = mockAudit()
    audit({ action: 'invoice.refund', actor: { type: 'system', id: 's' } })
    expect(captured.toIncludeAuditOf({ action: /^invoice\./ })).toBe(true)
    captured.restore()
  })
})

describe('auditEnricher()', () => {
  it('skips events without audit field', async () => {
    const ctx = createEnrichCtx()
    await auditEnricher()(ctx)
    expect(ctx.event.audit).toBeUndefined()
  })

  it('populates context fields when audit is present', async () => {
    const ctx = createEnrichCtx(
      { audit: { action: 'a', actor: { type: 'user', id: 'u1' }, outcome: 'success' } },
      { 'user-agent': 'jest', 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
      'req-1',
    )
    await auditEnricher()(ctx)
    const audit = ctx.event.audit as AuditFields
    expect(audit.context).toMatchObject({
      requestId: 'req-1',
      ip: '1.2.3.4',
      userAgent: 'jest',
    })
  })

  it('uses tenantId resolver', async () => {
    const ctx = createEnrichCtx(
      { audit: { action: 'a', actor: { type: 'user', id: 'u1' }, outcome: 'success' } },
    )
    await auditEnricher({ tenantId: () => 'tenant_42' })(ctx)
    expect((ctx.event.audit as AuditFields).context?.tenantId).toBe('tenant_42')
  })

  it('uses better-auth bridge to fill missing actor', async () => {
    const ctx = createEnrichCtx(
      { audit: { action: 'a', actor: undefined as unknown as AuditFields['actor'], outcome: 'success' } as AuditFields },
    )
    await auditEnricher({
      bridge: { getSession: () => ({ type: 'user', id: 'session-user' }) },
    })(ctx)
    expect((ctx.event.audit as AuditFields).actor.id).toBe('session-user')
  })
})

describe('auditOnly()', () => {
  it('only forwards events that carry an audit field', async () => {
    const sink = vi.fn<(ctx: DrainContext) => Promise<void>>(async () => {})
    const wrapped = auditOnly(sink)
    await wrapped(createDrainCtx({}))
    await wrapped(createDrainCtx({ audit: { action: 'a', actor: { type: 'user', id: 'u1' }, outcome: 'success' } }))
    expect(sink).toHaveBeenCalledTimes(1)
  })

  it('with await: true awaits the wrapped drain', async () => {
    let resolved = false
    const sink = vi.fn<(ctx: DrainContext) => Promise<void>>(async () => {
      await new Promise(r => setTimeout(r, 5))
      resolved = true
    })
    const wrapped = auditOnly(sink, { await: true })
    await wrapped(createDrainCtx({ audit: { action: 'a', actor: { type: 'user', id: 'u1' }, outcome: 'success' } }))
    expect(resolved).toBe(true)
  })
})

describe('signed() — hmac', () => {
  it('adds a deterministic signature for matching events', async () => {
    const calls: WideEvent[] = []
    const drain = signed((ctx: DrainContext) => {
      calls.push(ctx.event)
    }, { strategy: 'hmac', secret: 'topsecret' })
    const ctx1 = createDrainCtx({ audit: { action: 'a', actor: { type: 'user', id: 'u1' }, outcome: 'success' } })
    const ctx2 = createDrainCtx({ audit: { action: 'a', actor: { type: 'user', id: 'u1' }, outcome: 'success' } })
    await drain(ctx1)
    await drain(ctx2)
    expect((calls[0]!.audit as AuditFields).signature).toBeDefined()
    expect((calls[0]!.audit as AuditFields).signature).toBe((calls[1]!.audit as AuditFields).signature)
  })

  it('passes through events without audit', async () => {
    const drain = signed(() => {}, { strategy: 'hmac', secret: 's' })
    await expect(drain(createDrainCtx())).resolves.toBeUndefined()
  })
})

describe('signed() — hash-chain', () => {
  it('chains events via prevHash', async () => {
    const calls: WideEvent[] = []
    const drain = signed((ctx: DrainContext) => {
      calls.push(ctx.event)
    }, { strategy: 'hash-chain' })
    const make = () => createDrainCtx({ audit: { action: 'a', actor: { type: 'user', id: 'u1' }, outcome: 'success' } })
    await drain(make())
    await drain(make())
    await drain(make())

    const a1 = calls[0]!.audit as AuditFields
    const a2 = calls[1]!.audit as AuditFields
    const a3 = calls[2]!.audit as AuditFields
    expect(a1.prevHash).toBeUndefined()
    expect(a2.prevHash).toBe(a1.hash)
    expect(a3.prevHash).toBe(a2.hash)
    expect(a1.hash).toBeDefined()
    expect(a2.hash).toBeDefined()
    expect(a3.hash).toBeDefined()
  })

  it('persists chain head via state.save', async () => {
    const saved: string[] = []
    const drain = signed(() => {}, {
      strategy: 'hash-chain',
      state: {
        load: () => null,
        save: (h) => {
          saved.push(h)
        },
      },
    })
    await drain(createDrainCtx({ audit: { action: 'a', actor: { type: 'user', id: 'u1' }, outcome: 'success' } }))
    await drain(createDrainCtx({ audit: { action: 'b', actor: { type: 'user', id: 'u1' }, outcome: 'success' } }))
    expect(saved).toHaveLength(2)
    expect(saved[0]).not.toBe(saved[1])
  })

  it('resumes chain from state.load on first event', async () => {
    const calls: WideEvent[] = []
    const drain = signed((ctx: DrainContext) => {
      calls.push(ctx.event)
    }, {
      strategy: 'hash-chain',
      state: { load: () => 'previous-hash-from-disk', save: () => {} },
    })
    await drain(createDrainCtx({ audit: { action: 'a', actor: { type: 'user', id: 'u1' }, outcome: 'success' } }))
    expect((calls[0]!.audit as AuditFields).prevHash).toBe('previous-hash-from-disk')
  })
})

describe('idempotency key', () => {
  it('is stable across identical events in the same second', () => {
    const e1 = audit({ action: 'a', actor: { type: 'user', id: 'u1' }, target: { type: 't', id: 'r1' } })!
    const e2 = audit({ action: 'a', actor: { type: 'user', id: 'u1' }, target: { type: 't', id: 'r1' } })!
    const t1 = (e1.timestamp as string).slice(0, 19)
    const t2 = (e2.timestamp as string).slice(0, 19)
    if (t1 === t2) {
      expect((e1.audit as AuditFields).idempotencyKey).toBe((e2.audit as AuditFields).idempotencyKey)
    }
  })
})

describe('end-to-end: audit + auditOnly + global drain', () => {
  it('routes audit-only drain alongside the main drain', () => {
    const main = vi.fn<(ctx: DrainContext) => void>()
    const auditSink = vi.fn<(ctx: DrainContext) => void>()
    const onlyAudit = auditOnly(auditSink as never)
    initLogger({
      pretty: false,
      redact: false,
      drain: (ctx) => {
        main(ctx)
        return onlyAudit(ctx)
      },
    })

    const log = createLogger()
    log.audit?.({ action: 'x', actor: { type: 'user', id: 'u1' } })
    log.emit()

    expect(main).toHaveBeenCalledTimes(1)
    expect(auditSink).toHaveBeenCalledTimes(1)
  })
})

describe('auditRedactPreset', () => {
  it('drops authorization headers', () => {
    const config = resolveRedactConfig(auditRedactPreset)!
    expect(config.paths).toContain('headers.authorization')
  })

  it('drops password fields under audit.changes', () => {
    const config = resolveRedactConfig(auditRedactPreset)!
    expect(config.paths).toContain('audit.changes.before.password')
    expect(config.paths).toContain('audit.changes.after.password')
  })
})

describe('withAuditMethods()', () => {
  it('attaches audit methods to a logger that lacks them', () => {
    const base: { set: (x: unknown) => void; getContext: () => Record<string, unknown> } = {
      set: vi.fn(),
      getContext: () => ({}),
    }
    const augmented = withAuditMethods(base as never)
    expect(typeof augmented.audit).toBe('function')
    expect(typeof augmented.audit.deny).toBe('function')
  })
})
