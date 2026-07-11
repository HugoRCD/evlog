---
"evlog": patch
---

Fix `createEvlog({ redact })` / `withEvlog` so custom `redact` rules apply to the main Next.js request wide event (console output and drain), not only forked child events.
