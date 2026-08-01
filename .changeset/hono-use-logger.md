---
"evlog": minor
---

feat(hono): export `useLogger()` and enable `log.fork()` — Hono was the only framework integration without `useLogger()`, so reaching the request logger from a service or repository meant threading the Hono `Context` down through every call. `import { useLogger } from 'evlog/hono'` now resolves the same logger `c.get('log')` returns, and `c.get('log')` is unchanged — it stays the idiomatic accessor inside route handlers. Attaching AsyncLocalStorage also enables `log.fork()` on Hono, for background work that emits its own wide event correlated by `_parentRequestId`.

**Cloudflare Workers:** `useLogger()` is backed by `AsyncLocalStorage`, so `evlog/hono` now imports `node:async_hooks`. Workers deployments need the `nodejs_compat` (or `nodejs_als`) compatibility flag in `wrangler.toml`. If you cannot enable it, use `evlog/workers`, which stays free of `node:async_hooks` by design.
