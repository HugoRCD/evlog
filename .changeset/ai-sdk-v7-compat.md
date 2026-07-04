---
"evlog": minor
---

Add AI SDK v7 compatibility for `evlog/ai`. `createEvlogIntegration()` now implements both v6 hooks (`onToolCallFinish`, `onFinish`) and v7 hooks (`onToolExecutionEnd`, `onEnd`, `onEmbedEnd`, `onAbort`, `onError`). On v7, embeddings are auto-captured via `onEmbedEnd` when telemetry is enabled, and abort/error lifecycle events are written to the wide event. Pass the integration via `telemetry.integrations` (v7) or `experimental_telemetry.integrations` (v6). Exports a new `EvlogTelemetry` type.
