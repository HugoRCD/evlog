---
"evlog": patch
---

Fix Nuxt auto-import types for `useLogger`, `log`, `parseError`, and related helpers. The Nuxt module now sets `typeFrom: 'evlog'` / `'evlog/client'` so generated declarations resolve through package exports instead of extensionless `dist/` paths that typed as `any`.
