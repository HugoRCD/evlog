---
'@evlog/telemetry': minor
---

Add a per-command monotonic run counter (`advanceRunState`) that lives in the tool's own telemetry data directory and is keyed by command name only, so it is per machine rather than per project. It returns the run ordinal and the signed score delta against the previous run, or `undefined` without writing when telemetry is off or the run is in ephemeral CI. `telemetry disable` now purges this state, so the counter resets on opt-out.
