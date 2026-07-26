# @evlog/cli

## 0.2.0

### Minor Changes

- [#448](https://github.com/HugoRCD/evlog/pull/448) [`8338bf5`](https://github.com/HugoRCD/evlog/commit/8338bf5b58a2d0c11ca0210108a5411bcce39eea) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Add `evlog map` — a static observability score for your app, Lighthouse-style. It detects your framework (Nuxt, Nitro, Next.js App Router, or TanStack Start), scans every entry point, and scores wide-event coverage: `useLogger()`, request context (`log.set()`), structured errors (`createError({ why, fix })`), audit trails on sensitive routes, and error handling.

  `evlog map` prints the score, which areas of the app it comes from, and the three entry points to fix first with the file, the line, and a docs link for each. `evlog map --all` shows every entry point as a check matrix grouped by directory, and `evlog map <route-or-file>` explains one entry point in full: why it was scanned, why it was flagged sensitive, each rule's verdict, and the shape the handler could take in your framework. `evlog.map.json` is written to the project root (skip with `--no-write`), and `--min-score <n>` gates CI with an explicit pass/fail verdict.

  Coverage is checked by a rule engine rather than a bag of heuristics: each rule has a stable id, a documented weight, and a docs link, and every finding carries the exact file and line it came from. Detection is AST-based, so a locally defined `useLogger()` stub does not count as instrumentation, `log.audit?.deny()` counts as an audit record, wrappers like `withEvlog` count as instrumentation, helpers re-exported through a local module count as evlog's, and a package only counts as sensitive when it is genuinely imported. Every documented way of reaching the request logger is read, including the one that never calls a factory — `req.context.log`, the shape evlog's TanStack Start and Nitro guides use. A rule with nothing to look at reports itself as not applicable instead of passing for free, and an entry point with nothing to instrument — a static page, evlog's own ingest endpoint — is set aside rather than counted as a gap, and left out of the project average instead of lifting it with a free 100.

  The report also suggests going further with evlog features the project has already adopted: promoting an error spelled out identically in several handlers into an entry of your existing catalog, extending an audit trail to a state change it does not cover yet, and installing `evlog/ai` or `evlog/better-auth` when those packages are dependencies. Suggestions are gated on evidence rather than on file names and never change the score, so a `--min-score` gate cannot fail because of one.

  A verdict you disagree with costs one comment instead of your CI gate:

  ```ts
  // evlog-map-disable-next-line wide-event, context -- liveness probe, deliberately silent
  export default defineEventHandler(() => ({ ok: true }));
  ```

  `evlog-map-disable-line` covers the line it trails, and `evlog-map-disable` on its own covers the whole file. Name several rule ids separated by commas or spaces, name none to cover every rule, and put your reason after `--`. The check is then reported as `n/a` with your reason attached, so it costs no score — but it stays visible: the report ends with `○ 2 checks disabled by comment in 1 entry point`, and in the JSON the check carries `"suppressed": true` with `summary.suppressedChecks` for the project total, so a CI job can tell how much of a green score is suppressed.

  `map` is safe to run and covered by tests, but it is early: it ships adapters for four frameworks and its rules are still being refined, so verdicts and scores can move between releases. Pin `@evlog/cli` as a dev dependency when a CI gate depends on the number.

### Patch Changes

- Updated dependencies [[`8f294d1`](https://github.com/HugoRCD/evlog/commit/8f294d17b65e17a77aa40f2be721168be35b61bb)]:
  - evlog@2.22.4

## 0.1.5

### Patch Changes

- Updated dependencies [[`c58ded1`](https://github.com/HugoRCD/evlog/commit/c58ded1f45bfb9b7117489667048f7eee1e83406)]:
  - @evlog/telemetry@0.2.0

## 0.1.4

### Patch Changes

- Updated dependencies [[`73a4d3c`](https://github.com/HugoRCD/evlog/commit/73a4d3c25bbcf528b92e928c9925a48147e87954)]:
  - @evlog/telemetry@0.1.2

## 0.1.3

### Patch Changes

- [`c448a1f`](https://github.com/HugoRCD/evlog/commit/c448a1fbc3c374d6be67ab54786b8d9591d8a73d) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Wire a default telemetry ingestion endpoint (`https://telemetry.evlog.cloud/api/telemetry/ingest`) so `evlog` CLI usage data is actually delivered instead of only buffering locally. This only changes _where_ already-consented events go — opt-out (`DO_NOT_TRACK=1`, `EVLOG_TELEMETRY=0`, `evlog telemetry disable`) and the `EVLOG_TELEMETRY_ENDPOINT` override still work exactly as before.

## 0.1.2

### Patch Changes

- Updated dependencies [[`00fadc9`](https://github.com/HugoRCD/evlog/commit/00fadc9573ae8d49b64a5deccd6d2e93ee3ad66b)]:
  - evlog@2.22.3

## 0.1.1

### Patch Changes

- Updated dependencies [[`8f7b5e3`](https://github.com/HugoRCD/evlog/commit/8f7b5e3c933bfd58e910dfa501dbfc0789260cb5)]:
  - evlog@2.22.2

## 0.1.0

### Minor Changes

- [#431](https://github.com/HugoRCD/evlog/pull/431) [`0b90010`](https://github.com/HugoRCD/evlog/commit/0b90010a614ae4e03ec823592ff3a5eec592dc66) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Introduce the evlog CLI (`@evlog/cli`, binary `evlog`). First release ships `evlog doctor` — diagnoses your setup (Node version, evlog install, local `.evlog/logs` sink) with a branded terminal report or `--json` output — plus `evlog telemetry status|enable|disable`. Opt into debug with `--debug` / `EVLOG_CLI_DEBUG=1`. Commands use `defineEvlogCommand` → `{ cli, log, ui }`: `log.step` / `log.finding(cliErrors.X)` for diagnostics, `ui.done` for human/json/exit. Compact case-file on stderr; raw event with `--json --debug`. Workspace detection covers pnpm, bun (`bun.lock` / `bun.lockb`), npm, and yarn.

  `--json`, `--debug`, and telemetry all include an `environment` stage (`development` | `preview` | `production`). Packaged installs (`npx` / `node_modules`) report `production`; workspace builds report `development`. Override with `EVLOG_CLI_ENV` / `EVLOG_TELEMETRY_ENV`, or inherit `VERCEL_ENV`.

  `withTelemetry()` is now generic over citty `ArgsDef`, so root commands with typed flags (e.g. `--debug`) type-check cleanly. `evlog telemetry status` (and any tool using `defineTelemetryCommands`) prints the local data directory path. Telemetry `env.environment` is part of the standard envelope; authors may pass `environment` in `TelemetryOptions`.

### Patch Changes

- Updated dependencies [[`0b90010`](https://github.com/HugoRCD/evlog/commit/0b90010a614ae4e03ec823592ff3a5eec592dc66), [`573f772`](https://github.com/HugoRCD/evlog/commit/573f772cdb0d69425739c389b780119fbb63259e), [`9b2d3d9`](https://github.com/HugoRCD/evlog/commit/9b2d3d94ad0e922942f35cc6b604db7e8b764fa0)]:
  - @evlog/telemetry@0.1.1
  - evlog@2.22.1
