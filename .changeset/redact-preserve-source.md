---
"evlog": patch
---

Fix redaction mutating source objects and arrays passed by reference. Wide events are now deep-cloned before redaction, so `log.info({ user })` and `createLogger().emit()` only scrub the emitted copy sent to console and drains.
