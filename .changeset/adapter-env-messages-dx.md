---
"evlog": patch
---

Adapter error and deprecation messages now show canonical environment variable names only (`BETTER_STACK_API_KEY`, `AXIOM_API_KEY`, `SENTRY_DSN`, etc.). `NUXT_*` aliases still resolve silently for backward compatibility, but are no longer mentioned in console output or documentation.
