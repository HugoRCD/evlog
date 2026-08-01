---
"evlog": minor
---

fix(core): stop dropping `waitUntil` when a `defineEvlog()` config is passed to middleware — `toMiddlewareOptions()` copied every other `BaseEvlogOptions` field but silently omitted `waitUntil`, so `defineEvlog({ waitUntil })` lost the serverless drain hook on its way to the framework integration and drains were awaited inline instead of being registered with the platform. `evlog/hono` now also picks up `c.executionCtx.waitUntil` on its own, so drains on Cloudflare Workers and Vercel Edge complete after the response is returned with no manual wiring; adapters without an `ExecutionContext` (Node, Bun, Deno) keep draining inline, and an explicit `waitUntil` option still wins
