---
'@evlog/cli': minor
---

`evlog map` now records `mapRunOrdinal` and `mapScoreDelta`: the run's place in the per-machine run sequence and the signed score change since the previous `map` run on that machine. The delta is absent on the first run, both fields are omitted in ephemeral CI and while telemetry is off, and `evlog telemetry disable` resets the counter. This is how we can tell, in aggregate, whether running `evlog map` actually makes scores rise.
