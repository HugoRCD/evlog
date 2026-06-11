---
"evlog": patch
---

Fix duplicate terminal output when Next.js `captureOutput` is enabled: pretty-print writes use the native stdout handle registered at patch time, passthrough is skipped unless `silent: true`, and evlog-formatted terminal lines are ignored by capture. Next.js dev stacks are source-mapped to original TypeScript (like Nitro) via a Next-only enricher that does not bundle nitropack/youch; stored stacks are compacted and useless `.next`/`node:` snippet previews are skipped. The primary `at` line now points at your route/handler file instead of Next `route-modules` internals.
