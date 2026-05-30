---
'evlog': patch
---

Fix `evlog/elysia` to capture unmatched routes so Elysia 404 responses emit HTTP events with the correct path and error level.
