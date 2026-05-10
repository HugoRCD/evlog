---
'evlog': patch
---

Fix a runtime crash on Vercel + Bun + Nitro v3 where evlog probed `nitropack/runtime/internal/config` even though only Nitro v3 was installed. Bun's auto-install kicked in for the missing dependency and tried to write `node_modules/.cache`, which crashes on Vercel's read-only function filesystem with `bun is unable to write files: ReadOnlyFileSystem`.

The Nitro plugins now declare their major version once (via the new internal `setActiveNitroRuntime` helper) and the shared config bridge probes only the matching runtime — `nitro/runtime-config` for v3, `nitropack/...` for v2. Adapters resolving config through `runtimeConfig.evlog.<adapter>` benefit from the same restriction, so `createPostHogDrain()` (and any adapter using `resolveAdapterConfig`) no longer triggers the cross-version probe.

No public-API change. The `process.env.__EVLOG_CONFIG` fast path remains the highest-priority lookup.

Closes [#312](https://github.com/HugoRCD/evlog/issues/312).
