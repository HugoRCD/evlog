---
"evlog": minor
---

Add `evlog/eve` with `defineEvlogHook()` for one wide event per agent turn and `useLogger()` in tools (AsyncLocalStorage on `turn.started`; pass `ctx` only when ALS is unavailable) — full drain, enrich, and tail-sampling pipeline. Tracks tool durations (including post-approval resumes), session context carry-over with LRU eviction (`maxSessions`), slim `eve.phase` / `eve.sessionTurns` fields, and compact HITL `approval`. The turn logger is bound via AsyncLocalStorage on `turn.started`; pass `ctx` when ALS is unavailable. Turn state is shared via `globalThis` when eve bundles hooks and tools separately. `finalizeAudit()` no longer crashes on partial `audit` objects missing `actor` fields. Fixes `_auditForceKeep` leaking on force-kept events and skips Nitro runtime probes on Next.js hosts.
