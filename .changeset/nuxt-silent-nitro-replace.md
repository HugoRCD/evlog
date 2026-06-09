---
"evlog": patch
---

Fix Nuxt `silent` option not suppressing built-in console output in production builds on evlog 2.11+. The Nuxt module now bakes evlog options into `nitro.options.replace.__EVLOG_CONFIG__` (matching standalone Nitro modules), so the Nitro plugin receives `silent: true` and no longer emits an unenriched log line before your `evlog:drain` hook runs.
