---
"evlog": patch
---

`useLogger()` from `evlog/eve` no longer throws when it cannot reach the current turn's logger. It warns once for that turn and returns a logger that accepts every call and emits nothing, so a tool is never failed by its own instrumentation.

Turn state is held per process, while an eve turn is durable and can resume in another process after a step boundary. A tool calling `useLogger(ctx)` after such a resume used to throw, which failed the tool itself — a long-running turn could lose real work to a missing log field. Enrichment for that turn is dropped instead, and the warning names the turn so the gap is visible.
