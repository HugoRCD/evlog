---
"@evlog/cli": minor
---

Add Hono support to `evlog map`. The scanner detects Hono projects and extracts routes from `app.get('/path', handler)` registrations, including `app.on()` with array methods or paths. The facts layer recognizes `c.get('log')` as a logger binding, so Hono handlers using the idiomatic accessor score correctly, and the report distinguishes an app that registered `app.use(evlog())` (thin ambient events) from one that never did (dark). `evlog map <file>` suggests the handler shape in Hono's own idiom, and `evlog agents` documents the accessor in its AGENTS.md block.
