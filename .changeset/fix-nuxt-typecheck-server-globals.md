---
"evlog": patch
---

Fix `nuxt typecheck` failing with `TS2304: Cannot find name 'useLogger'` (and `createEvlogError`) on server routes. `$fetch`'s return-type inference pulls server routes — and their auto-imported globals — into the app tsconfig project's typecheck too, but the Nuxt module only declared these globals for the server project. `useLogger` and `createEvlogError` are now declared for both projects; the server-only `log` export stays scoped to the server project since it shares its global name with the (differently-typed) client `log`.
