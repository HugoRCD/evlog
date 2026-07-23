# @evlog/cli

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
