---
'evlog': minor
---

Expose AI SDK execution metadata as a public API on `AILogger`. Three new methods let app code read the same data that gets attached to wide events: `getMetadata()` returns an immutable snapshot of the run (model, provider, tokens, calls, steps, tool calls, cost, finish reason, embeddings), `getEstimatedCost()` returns the dollar cost computed from the configured pricing map, and `onUpdate(cb)` subscribes to incremental snapshots emitted on every step, embedding, error, and integration finish (returns an unsubscribe function). New types `AIMetadata` (alias for `AIEventData`) and `AIMetadataListener` are exported. `model` and `provider` on `AIMetadata` are now optional to reflect early-snapshot reality (e.g. embedding-only runs).
