---
"evlog": patch
---

Fix Nuxt auto-import types for `useLogger`, `log`, `parseError`, and related helpers. The Nuxt module now sets `typeFrom: 'evlog'` / `'evlog/client'`, and the build mirrors `.d.mts` → `.d.ts` so Nitro/Nuxt extensionless import paths no longer resolve as `any`.
