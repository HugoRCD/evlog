---
"evlog": minor
---

feat(core): expose `durationMs` as a number on the wide event

Request loggers now write `durationMs` (a number, in milliseconds) next to the existing `duration` string. `duration` keeps its current shape — `"12ms"`, `"1.20s"` — and is still what the pretty terminal renders; `durationMs` is the one to query. Backends stop needing a parse step: ClickHouse can `avg()` and `quantile(0.95)()` on a real column, LogQL can do `| json | durationMs > 1000`, and facet-based UIs get a numeric field instead of a string.

The ClickHouse adapter's default `toClickHouseRow()` maps it to a new `duration_ms` column. Add it to an existing table before upgrading:

```sql
ALTER TABLE evlog_events ADD COLUMN duration_ms Nullable(UInt32) AFTER duration;
```

Durations are measured with a clamped elapsed helper, so a backward wall-clock step (NTP, manual change) during a request can no longer surface a negative `durationMs`, `duration`, or tail-sampling duration.

`BaseWideEvent` now declares both fields, so `event.durationMs` is typed `number | undefined` in enrichers and drains. Code that read `event.duration` as a number was already wrong at runtime and will now fail to type-check — switch it to `event.durationMs`.
