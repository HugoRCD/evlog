---
'evlog': minor
---

Add AI SDK telemetry integration (`createEvlogIntegration`), cost estimation, and enriched embedding capture. `createEvlogIntegration()` implements the AI SDK's `TelemetryIntegration` interface to capture per-tool execution timing/success/errors and total generation wall time. Cost estimation computes `ai.estimatedCost` from a user-provided pricing map. `captureEmbed` now accepts model ID, dimensions, and batch count for richer embedding observability.
