---
"evlog": minor
---

Add `internal` to `createError` / `ErrorOptions`: backend-only context stored on `EvlogError`, included in wide events via `log.error()`, never serialized in HTTP responses or `toJSON()` ([EVL-140](https://linear.app/evlog/issue/EVL-140)).
