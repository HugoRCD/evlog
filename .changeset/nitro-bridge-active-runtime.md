---
'evlog': patch
---

Fix a runtime crash on Vercel + Bun + Nitro v3 where every request failed with `bun is unable to write files: ReadOnlyFileSystem`. The Nitro plugin probed `nitro/runtime-config` at runtime to read evlog's config; that module transitively imports the build-only `#nitro/virtual/runtime-config`, which doesn't exist in deployed bundles. On Vercel + Bun the missing virtual triggered Bun's package auto-installer, which tried to write `node_modules/.cache` and crashed on the read-only function filesystem.

The Nitro modules now bake the evlog config into the bundle as a literal via `nitro.options.replace.__EVLOG_CONFIG__`. The shared config bridge reads that build-time literal first and skips all runtime probing — no `import('nitro/runtime-config')`, no env propagation guesswork. The bridge also exposes the inlined value as a synthetic `{ evlog: <inlined> }` record, so drain adapters resolving `runtimeConfig.evlog.<adapter>` never trigger the probe either.

For defense-in-depth, the bridge additionally scopes its dynamic-import fallback to the major version declared by the plugin (new internal `setActiveNitroRuntime` helper) — `nitro/runtime-config` for v3, `nitropack/...` for v2 — so standalone use outside a plugin (e.g. adapters called from non-Nitro code) doesn't probe both versions.

No public-API change.

Closes [#312](https://github.com/HugoRCD/evlog/issues/312).
