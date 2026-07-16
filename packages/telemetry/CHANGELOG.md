# @evlog/telemetry

## 0.1.0

### Minor Changes

- [#417](https://github.com/HugoRCD/evlog/pull/417) [`0a66edf`](https://github.com/HugoRCD/evlog/commit/0a66edf3d67ac4e52050eeacea201e119d530465) Thanks [@HugoRCD](https://github.com/HugoRCD)! - # @evlog/telemetry

  Initial release of `@evlog/telemetry` — evlog's wide-event model for CLIs and automation. One structured event per command via citty `withTelemetry` or `createTelemetry()`, privacy-safe flag capture, disk-buffered outbox, auto-generated disclosure, GitHub Actions helper, and `@evlog/telemetry/ingest` with `parseIngestBody()` for server endpoints. Opt-out via `DO_NOT_TRACK`, `EVLOG_TELEMETRY=0`, or persisted preference.
