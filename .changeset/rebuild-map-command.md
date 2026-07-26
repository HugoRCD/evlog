---
"@evlog/cli": minor
---

Add `evlog map` — a static observability score for your app, Lighthouse-style. It detects your framework (Nuxt, Nitro, Next.js App Router, or TanStack Start), scans every entry point, and scores wide-event coverage: `useLogger()`, request context (`log.set()`), structured errors (`createError({ why, fix })`), audit trails on sensitive routes, and error handling.

`evlog map` prints the score, which areas of the app it comes from, and the three entry points to fix first with the file, the line, and a docs link for each. `evlog map --all` shows every entry point as a check matrix grouped by directory, and `evlog map <route-or-file>` explains one entry point in full: why it was scanned, why it was flagged sensitive, each rule's verdict, and the shape the handler could take in your framework. `evlog.map.json` is written to the project root (skip with `--no-write`), and `--min-score <n>` gates CI with an explicit pass/fail verdict.

Coverage is checked by a rule engine rather than a bag of heuristics: each rule has a stable id, a documented weight, and a docs link, and every finding carries the exact file and line it came from. Detection is AST-based, so a locally defined `useLogger()` stub does not count as instrumentation, `log.audit?.deny()` counts as an audit record, wrappers like `withEvlog` count as instrumentation, helpers re-exported through a local module count as evlog's, and a package only counts as sensitive when it is genuinely imported. Every documented way of reaching the request logger is read, including the one that never calls a factory — `req.context.log`, the shape evlog's TanStack Start and Nitro guides use. A rule with nothing to look at reports itself as not applicable instead of passing for free, and an entry point with nothing to instrument — a static page, evlog's own ingest endpoint — is set aside rather than counted as a gap, and left out of the project average instead of lifting it with a free 100.

The report also suggests going further with evlog features the project has already adopted: promoting an error spelled out identically in several handlers into an entry of your existing catalog, extending an audit trail to a state change it does not cover yet, and installing `evlog/ai` or `evlog/better-auth` when those packages are dependencies. Suggestions are gated on evidence rather than on file names and never change the score, so a `--min-score` gate cannot fail because of one.

A verdict you disagree with costs one comment instead of your CI gate:

```ts
// evlog-map-disable-next-line wide-event, context -- liveness probe, deliberately silent
export default defineEventHandler(() => ({ ok: true }))
```

`evlog-map-disable-line` covers the line it trails, and `evlog-map-disable` on its own covers the whole file. Name several rule ids separated by commas or spaces, name none to cover every rule, and put your reason after `--`. The check is then reported as `n/a` with your reason attached, so it costs no score — but it stays visible: the report ends with `○ 2 checks disabled by comment in 1 entry point`, and in the JSON the check carries `"suppressed": true` with `summary.suppressedChecks` for the project total, so a CI job can tell how much of a green score is suppressed.

`map` is safe to run and covered by tests, but it is early: it ships adapters for four frameworks and its rules are still being refined, so verdicts and scores can move between releases. Pin `@evlog/cli` as a dev dependency when a CI gate depends on the number.
