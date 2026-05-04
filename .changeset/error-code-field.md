---
'evlog': minor
---

Add an optional `code` field to `createError` / `EvlogError` so structured errors can carry a stable, machine-readable identifier for client branching, dashboards, and future error-catalog tooling. Foundation for an upcoming `defineErrorCatalog` primitive.

```ts
import { createError, parseError } from 'evlog'

throw createError({
  code: 'PAYMENT_DECLINED',
  message: 'Payment failed',
  status: 402,
  why: 'Card declined by issuer',
  fix: 'Try a different payment method',
})

// Client
const err = parseError(caught)
if (err.code === 'PAYMENT_DECLINED') retryWithDifferentCard()
```

`code` is public and propagates through every existing serialization path with no breaking change:

- **HTTP responses** — surfaces under `data.code` via the existing `EvlogError.data` getter (Nitro v2/v3, Next.js, and any framework using `serializeEvlogErrorResponse` get it for free).
- **`parseError(err)`** — new `code` field on `ParsedError`. Extracted from EvlogError JSON, h3-style `data.code`, and Node-style `Error.code` (e.g. `'ENOENT'`, `'ECONNRESET'`) so existing system errors flow through the same client branch.
- **Wide events** — copied onto `event.error.code` so drains and dashboards can group, alert, and chart by code without parsing free-text messages.
- **`toString()`** — renders a `Code:` line for terminal pretty-print.

Out of scope here (planned next): `defineErrorCatalog` for centralized typed code unions, plus the equivalent for audit actions.
