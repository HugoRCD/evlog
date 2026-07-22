---
"evlog": patch
---

Fix `nuxt typecheck` failing with `TS2304: Cannot find name 'useLogger'` (and `log`/`createEvlogError`) on server routes. The Nuxt module now registers `types/evlog-server.d.ts` on both the `nitro` and `nuxt` tsconfig contexts — previously it was only added to the server project, but `$fetch`'s return-type inference pulls server routes (and their auto-imports) into the app project's typecheck too.
