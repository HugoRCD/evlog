---
'evlog': minor
---

Add typed error and audit catalogs as a thin layer over `createError` and `defineAuditAction`. Three new primitives, zero runtime registration, zero init step. The whole feature is opt-in: existing `createError({ code, ... })` and `defineAuditAction(...)` call sites keep working unchanged, with no migration required.

```ts
import { defineErrorCatalog, defineAuditCatalog } from 'evlog'

export const billingErrors = defineErrorCatalog('billing', {
  PAYMENT_DECLINED: { status: 402, message: 'Card declined', why: '...', fix: '...', link: '...' },
  INSUFFICIENT_FUNDS: {
    status: 402,
    message: ({ available, required }: { available: number, required: number }) =>
      `Insufficient funds: $${available}/$${required}`,
  },
})

export const billingAudit = defineAuditCatalog('billing', {
  INVOICE_REFUND: { target: 'invoice' },
  INVOICE_CREATE: { target: 'invoice' },
})

throw billingErrors.PAYMENT_DECLINED({ cause: stripeErr })
throw billingErrors.INSUFFICIENT_FUNDS({ available: 5, required: 100 })
log.audit(billingAudit.INVOICE_REFUND({ actor, target: { id: 'inv_889' } }))
```

New API on the main `evlog` entrypoint:

- `defineError(code, options)` — single-error factory bound to a stable code. Accepts every existing `EvlogError` field plus a `tags` array and an `internal` defaults object. `message` can be either a string or a typed function whose params become required at the call site.
- `defineErrorCatalog(prefix, map)` — bundle a record of entries under a common prefix. The wire `code` for each entry is `${prefix}.${KEY}` (UPPER_SNAKE_CASE keys preserved). Catalog metadata (`_codes`, `_prefix`) exposed for introspection.
- `defineAuditCatalog(prefix, map)` — symmetric primitive for audit actions. Each entry produces a thin wrapper around `defineAuditAction` with the prefix and target type pre-applied. Exposes `_actions` and `_prefix`.

Type-level upgrade (opt-in, zero runtime cost):

- `RegisteredErrorCatalogs` and `RegisteredAuditCatalogs` interfaces (empty by default, augmentable via `declare module 'evlog'`).
- New `ErrorCode` and `AuditAction` types derived from registered catalogs.
- `ErrorOptions.code` and `ParsedError.code` now typed as `ErrorCode | (string & {})` — autocomplete on registered codes everywhere (`createError`, `parseError`, custom helpers) without breaking ad-hoc string usage.

Catalog factories return regular `EvlogError` instances and `AuditInput` objects respectively, so they integrate transparently with every existing evlog primitive (HTTP serializers, `parseError`, wide event capture, audit pipeline, drains). Catalogs are pure data — package them as npm libraries (one prefix per package), and the typing flows transitively to consumers via the published `.d.ts`. No global init, no proxy, no string-based dispatch helper.
