---
'evlog': minor
---

Add `evlog/toolkit/storage` for `createLoggerStorage` so edge/Workers integrations can import ALS separately. The main `evlog/toolkit` barrel still re-exports it for compatibility; prefer `evlog/toolkit/storage` when you need to keep `node:async_hooks` out of bundles that do not tree-shake unused exports. Drop the barrel re-export at the next major.
