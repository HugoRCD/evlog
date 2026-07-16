---
"@evlog/telemetry": minor
---

Initial release of `@evlog/telemetry` — evlog's wide-event model for CLIs and automation. One structured event per command via citty `withTelemetry` or `createTelemetry()`, privacy-safe flag capture, disk-buffered outbox, auto-generated disclosure, GitHub Actions helper, and `@evlog/telemetry/ingest` with `parseIngestBody()` for server endpoints. Opt-out via `DO_NOT_TRACK`, `EVLOG_TELEMETRY=0`, or persisted preference.
