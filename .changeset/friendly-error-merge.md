---
"evlog": patch
---

fix(core): record the same error twice without crashing. A handler that logs the error it then throws hands the same instance to `log.error()` and to the integration's `finish({ error })`; the second merge walked into the caller's own object and threw on any read-only field it carried.
