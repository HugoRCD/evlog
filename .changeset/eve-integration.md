---
"evlog": minor
---

Add `evlog/eve` with `defineEvlogHook()` for one wide event per agent turn and `useTurnLogger(ctx)` in tools — full drain, enrich, and tail-sampling pipeline. Turn state is shared via `globalThis` when Eve bundles hooks and tools separately. `finalizeAudit()` no longer crashes on partial `audit` objects missing `actor` fields.
