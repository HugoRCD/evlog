---
"evlog": patch
---

Emit a wide event for eve turns that end without `turn.completed` or `turn.failed`.

A turn cancelled by eve produced no wide event, and its logger, accumulator and session slot stayed in memory for good: LRU eviction skips any session that still has an active turn, so nothing ever reclaimed them. `turn.cancelled` now closes the turn on its own terminal path — status `499`, `eve.phase: 'cancelled'`, level `info`, because cancellation is not a failure in eve's model.

`session.failed` and `session.completed` flush any turn still open for that session and drop its carried-over context, which also ends the indefinite retention of snapshots for finished sessions.
