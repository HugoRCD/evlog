---
'evlog': minor
---

Add `minLevel` for a deterministic severity threshold on the global `log` API and client `initLog`, plus `setMinLevel()` for runtime toggling in the browser. Orthogonal to probabilistic `sampling.rates`; request wide events from `useLogger` / `createLogger().emit()` are unchanged. Includes `isLevelEnabled()` helper and wiring for Nuxt, Vite, and Next.js.

**2026-04-11** — Playground: interactive panel to try client `minLevel` / `setMinLevel` and trigger logs per level.
