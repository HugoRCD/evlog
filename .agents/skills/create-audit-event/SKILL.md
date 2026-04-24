---
name: create-audit-event
description: Compose audit events in evlog using the existing wide-event primitives. Use when adding a new audit log call site (`log.audit`, `audit()`, `withAudit()`, `defineAuditAction()`) or wiring `auditEnricher`, `auditOnly`, and `signed` drain wrappers into an app.
---

# Create an evlog Audit Event

Audit logs in evlog are not a parallel system. They are a **typed `audit` field on the wide event** plus a few helpers and drain wrappers. Always compose with the existing pipeline (`enrichers`, `drains`, `redact`, tail-sampling) instead of introducing a new one.

## Mental Model

```text
log.audit(...) ──► sets event.audit ──► force-keep ──► auditEnricher ──► redact ──► every drain
                                                                                  └─► auditOnly(signed(fsDrain)) (audit-only sink)
```

- `log.audit(...)` is sugar for `log.set({ audit })` + force-keep.
- `audit({...})` is the same, but for non-request contexts (jobs, scripts).
- `withAudit({...})(fn)` automates `success` / `failure` / `denied` outcomes.
- `auditOnly(drain)` filters events down to those with `event.audit` set.
- `signed(drain, { strategy })` adds tamper-evident integrity (`hmac` or `hash-chain`).
- `auditEnricher()` fills `event.audit.context` (req/trace/ip/ua/tenantId).
- `auditRedactPreset` is a strict redact preset for audit events.

## When to Use What

| Situation | API |
|-----------|-----|
| Inside a request handler, action succeeded | `log.audit({ action, actor, target, outcome: 'success' })` |
| Inside a request handler, action denied (AuthZ) | `log.audit.deny('reason', { action, actor, target })` |
| Standalone job / script / CLI | `audit({ action, actor, target, outcome })` |
| Wrapping a function so success/failure is captured automatically | `withAudit({ action, target })(fn)` |
| Recording a state change | add `changes: auditDiff(before, after)` |
| Type-safe action registry | `const refund = defineAuditAction('invoice.refund', { target: 'invoice' })` then `refund.audit(log, { ... })` |
| Asserting audits in tests | `mockAudit()` |

## Schema (always provide these)

```ts
interface AuditFields {
  action: string                                  // e.g. 'invoice.refund'
  actor: { type: 'user' | 'system' | 'api' | 'agent', id: string, /* email, displayName, model, tools, reason, promptId */ }
  outcome: 'success' | 'failure' | 'denied'
  target?: { type: string, id: string, [k: string]: unknown }
  reason?: string
  changes?: { before?: unknown, after?: unknown } | AuditPatchOp[]
  causationId?: string
  correlationId?: string
  version?: number                                // defaults to AUDIT_SCHEMA_VERSION
  idempotencyKey?: string                         // auto-derived if absent
  context?: { requestId?, traceId?, ip?, userAgent?, tenantId?, ... }
  signature?: string                              // added by signed(drain, { strategy: 'hmac' })
  prevHash?: string                               // added by signed(drain, { strategy: 'hash-chain' })
  hash?: string                                   // added by signed(drain, { strategy: 'hash-chain' })
}
```

## Recipes

### 1. Add an audit call in a request handler

```ts
// server/api/invoice/[id]/refund.post.ts
import { auditDiff } from 'evlog'

export default defineEventHandler(async (event) => {
  const log = useLogger(event)
  const { id } = getRouterParams(event)
  const before = await db.invoice.get(id)

  if (!can(event, 'invoice.refund', before)) {
    log.audit?.deny('Insufficient permissions', {
      action: 'invoice.refund',
      actor: actorOf(event),
      target: { type: 'invoice', id },
    })
    throw createError({ status: 403 })
  }

  const after = await db.invoice.refund(id)

  log.audit?.({
    action: 'invoice.refund',
    actor: actorOf(event),
    target: { type: 'invoice', id, amount: after.amount },
    outcome: 'success',
    changes: auditDiff(before, after),
  })

  return after
})
```

### 2. Wire the audit pipeline (one-time setup)

```ts
// server/plugins/evlog.ts
import { auditEnricher, auditOnly, signed } from 'evlog'
import { createAxiomDrain } from 'evlog/axiom'
import { createFsDrain } from 'evlog/fs'

export default defineNitroPlugin((nitroApp) => {
  const enrichers = [auditEnricher({ tenantId: ctx => ctx.event.tenantId })]
  const auditSink = auditOnly(signed(createFsDrain({ path: '.audit/' }), {
    strategy: 'hash-chain',
  }), { await: true })
  const main = createAxiomDrain()

  nitroApp.hooks.hook('evlog:enrich', async (ctx) => {
    for (const e of enrichers) await e(ctx)
  })
  nitroApp.hooks.hook('evlog:drain', async (ctx) => {
    await Promise.all([main(ctx), auditSink(ctx)])
  })
})
```

### 3. Auto-instrument a service method

```ts
import { withAudit, AuditDeniedError } from 'evlog'

export const refundInvoice = withAudit({
  action: 'invoice.refund',
  target: ({ id }: { id: string }) => ({ type: 'invoice', id }),
  actor: () => ({ type: 'system', id: 'billing-worker' }),
})(async ({ id, by }) => {
  if (!by.canRefund) throw new AuditDeniedError('not allowed')
  return db.invoice.refund(id)
})
```

### 4. Test it

```ts
import { mockAudit } from 'evlog'

test('refund records an audit event', async () => {
  const audits = mockAudit()
  await refundInvoice({ id: 'inv_1', by: admin })
  audits.expectIncludes({ action: 'invoice.refund', outcome: 'success' })
})
```

## Rules

1. **Never** create an `evlog/audit*` sub-export. Everything lives on the main `evlog` entrypoint.
2. **Never** invent a parallel logger. Use `log.set({ audit: {...} })` if the helper is unsuitable.
3. **Always** provide `action`, `actor`, and `outcome`. `target` is strongly recommended.
4. **Always** wrap audit-only sinks with `auditOnly(...)` so non-audit events don't leak.
5. Use `signed(drain, { strategy: 'hash-chain' })` for tamper-evident audit storage; persist `state` via `{ load, save }` if you run multiple processes.
6. Apply `auditRedactPreset` (or merge it into your existing `RedactConfig`) before sending audits anywhere.
7. Audit events bypass tail-sampling automatically — do not add custom `evlog:emit:keep` rules just to keep them.
8. Idempotency keys are derived automatically; only set `idempotencyKey` manually if you have a stable application-level key.

## Touchpoints Checklist (when shipping a new audit feature)

| # | File | Action |
|---|------|--------|
| 1 | `packages/evlog/src/audit.ts` | Add helper / wrapper / preset |
| 2 | `packages/evlog/src/index.ts` | Re-export the new symbol |
| 3 | `packages/evlog/test/audit.test.ts` | Cover new behaviour |
| 4 | `apps/docs/content/2.logging/7.audit.md` | Document the new helper |
| 5 | `apps/playground/server/api/audit/*` | Add a runnable example if user-facing |
| 6 | `README.md` + `packages/evlog/README.md` | Mention in the audit section |

If your change adds a new field on `AuditFields`, also update `AUDIT_SCHEMA_VERSION` in `packages/evlog/src/audit.ts` and document the migration.
