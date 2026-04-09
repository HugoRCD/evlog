---
'evlog': patch
---

Fix Nuxt `evlog` options not reaching the Nitro plugin in dev: the Nuxt module now mirrors standalone Nitro by setting `process.env.__EVLOG_CONFIG` during `nitro:config`. When `enabled` is `false`, the Nitro plugins still attach a no-op request logger so `useLogger(event)` does not throw.
