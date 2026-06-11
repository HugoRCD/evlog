---
"evlog": patch
---

Fix `evlog/nitro/v3` pulling in the optional `h3` peer. The v3 plugin shared a deferred-drain helper from the v2 module, which imports `getHeaders` from `h3`, so the v3 bundle referenced `h3` even though the v3 runtime never uses it. Consumers that don't install `h3` directly (e.g. Nitro v3 / TanStack Start on Vite) failed to build with `"getHeaders" is not exported by "__vite-optional-peer-dep:h3:evlog"`. The helper now lives in an h3-free module, so the v3 path no longer references `h3`.
