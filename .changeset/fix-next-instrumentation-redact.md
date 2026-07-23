---
"evlog": patch
---

fix(next): thread `redact` through `createInstrumentation().register()` — it previously re-initialised the logger without redaction and locked it, silently disabling `redact` configured for the Next.js instrumentation path
