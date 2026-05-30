---
"@evlog/cli": minor
---

# Add `@evlog/cli`

Add `@evlog/cli` — CLI observability for evlog.

- `setupEvlog()` + `invoke()` + `createCommandLogger()` + `useLogger()`
- `@evlog/cli/citty` — `runMain()` adapter with auto-injected `--log` (peer: citty)
- `@evlog/cli/http` — `createOutboundHooks()` for ofetch (peer: ofetch)
- `errorCatalog` / `auditCatalog` config (symmetric with HTTP integrations)
- `cliRedactPreset`, `parseCliError`, `exitWithError`, flush-on-exit
- Default: drain-only (silent evlog console); `--log` / `logToConsole` for debug output
- Drain routing: wire `evlog/fs`, `evlog/axiom`, etc. in `src/drain.ts`; operator selects destination via env (see docs)
- Demo CLI: `pnpm example:cli` — citty + Clack, `useLogger()` for telemetry (see `examples/cli/`)
- Docs: `/integrate/frameworks/cli`

Peer dependency: `evlog`. Optional peers: `citty`, `ofetch`.
