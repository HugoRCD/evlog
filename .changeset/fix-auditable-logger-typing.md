---
"evlog": patch
---

# fix: type framework loggers as AuditableLogger with required `.audit()`

`useLogger()`, `c.get('log')`, `req.log`, and other integration surfaces now return `AuditableLogger` instead of `RequestLogger`, so `.audit()` type-checks without optional chaining. Matches runtime behavior from `createRequestLogger()`.

Closes #389
