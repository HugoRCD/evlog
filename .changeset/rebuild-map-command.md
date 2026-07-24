---
"@evlog/cli": minor
---

Add `evlog map` — a static observability score for your app, Lighthouse-style. Detects your framework (Nuxt, Nitro, Next.js App Router, or TanStack Start), scans every route, and scores wide-event coverage: `useLogger()`, request context (`log.set()`), structured errors (`createError({ why, fix })`), audit trails on sensitive routes, and error handling. Writes `evlog.map.json` to the project root (skip with `--no-write`), prints a route-by-route report with the worst offenders first (`--all` for the full list), and can gate CI with `--min-score <n>`.
