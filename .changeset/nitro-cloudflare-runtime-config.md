---
"evlog": patch
---

Fix Nitro server builds on strict Worker presets (e.g. `cloudflare-durable`) by avoiding Rollup-resolvable literals for `nitro/runtime-config` in published dist. Centralize runtime config access in an internal bridge (`__EVLOG_CONFIG` first, then dynamic `import()` with computed module specifiers for Nitro v3 and nitropack). Add regression tests for dist output and a `cloudflare-durable` production build using the compiled plugin.
