---
"evlog": patch
---

Prevent the Elysia integration from stalling `bun:test` lifecycle hooks by avoiding the side-effecting `AsyncLocalStorage.enterWith()` capability probe on Bun.
