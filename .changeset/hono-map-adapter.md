---
"@evlog/cli": minor
---

Add Hono adapter to `evlog map`. The scanner now detects Hono projects and extracts routes from `app.get('/path', handler)` registrations. Also teaches the facts layer to recognize `c.get('log')` as a logger binding, so Hono handlers using the idiomatic accessor score correctly.
