# @evlog/telemetry

## 0.2.0

### Minor Changes

- [#446](https://github.com/HugoRCD/evlog/pull/446) [`c58ded1`](https://github.com/HugoRCD/evlog/commit/c58ded1f45bfb9b7117489667048f7eee1e83406) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Collect `env.os` (operating system platform) and `env.arch` (CPU architecture) on every run event. Both fields are nullable and the ingest validator accepts events from older clients that omit them, so no action is required — update `@evlog/telemetry` on your ingest endpoint to store the new fields.

## 0.1.2

### Patch Changes

- [#444](https://github.com/HugoRCD/evlog/pull/444) [`73a4d3c`](https://github.com/HugoRCD/evlog/commit/73a4d3c25bbcf528b92e928c9925a48147e87954) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Fix the outbox getting permanently stuck when the ingest endpoint rejects a batch with a 4xx response (oversized batch, unknown tool, schema drift on older buffered events, etc.). Previously, any non-2xx response kept the batch buffered forever, and since the whole outbox is resent together on every run, one bad batch silently blocked all future telemetry for the tool. Batches rejected with 400/401/403/404 (anything but 429, which is treated as transient) are now dropped instead of retried indefinitely.

## 0.1.1

### Patch Changes

- [#431](https://github.com/HugoRCD/evlog/pull/431) [`0b90010`](https://github.com/HugoRCD/evlog/commit/0b90010a614ae4e03ec823592ff3a5eec592dc66) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Introduce the evlog CLI (`@evlog/cli`, binary `evlog`). First release ships `evlog doctor` — diagnoses your setup (Node version, evlog install, local `.evlog/logs` sink) with a branded terminal report or `--json` output — plus `evlog telemetry status|enable|disable`. Opt into debug with `--debug` / `EVLOG_CLI_DEBUG=1`. Commands use `defineEvlogCommand` → `{ cli, log, ui }`: `log.step` / `log.finding(cliErrors.X)` for diagnostics, `ui.done` for human/json/exit. Compact case-file on stderr; raw event with `--json --debug`. Workspace detection covers pnpm, bun (`bun.lock` / `bun.lockb`), npm, and yarn.

  `--json`, `--debug`, and telemetry all include an `environment` stage (`development` | `preview` | `production`). Packaged installs (`npx` / `node_modules`) report `production`; workspace builds report `development`. Override with `EVLOG_CLI_ENV` / `EVLOG_TELEMETRY_ENV`, or inherit `VERCEL_ENV`.

  `withTelemetry()` is now generic over citty `ArgsDef`, so root commands with typed flags (e.g. `--debug`) type-check cleanly. `evlog telemetry status` (and any tool using `defineTelemetryCommands`) prints the local data directory path. Telemetry `env.environment` is part of the standard envelope; authors may pass `environment` in `TelemetryOptions`.

## 0.1.0

### Minor Changes

- [#417](https://github.com/HugoRCD/evlog/pull/417) [`0a66edf`](https://github.com/HugoRCD/evlog/commit/0a66edf3d67ac4e52050eeacea201e119d530465) Thanks [@HugoRCD](https://github.com/HugoRCD)! - # @evlog/telemetry

  Initial release of `@evlog/telemetry` — evlog's wide-event model for CLIs and automation. One structured event per command via citty `withTelemetry` or `createTelemetry()`, privacy-safe flag capture, disk-buffered outbox, auto-generated disclosure, GitHub Actions helper, and `@evlog/telemetry/ingest` with `parseIngestBody()` for server endpoints. Opt-out via `DO_NOT_TRACK`, `EVLOG_TELEMETRY=0`, or persisted preference.
