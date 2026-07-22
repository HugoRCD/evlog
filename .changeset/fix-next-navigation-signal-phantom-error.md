---
"evlog": patch
---

Fix `withEvlog` (Next.js) logging a phantom ERROR at status 500 for every `redirect()`/`notFound()`/`forbidden()`/`unauthorized()` call. These APIs throw an internal Next.js control-flow signal that isn't a real error — `withEvlog` now detects it via `unstable_rethrow` and rethrows it untouched instead of logging and emitting an error event.
