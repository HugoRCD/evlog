---
'@evlog/cli': patch
---

`evlog map` telemetry now records per-kind entry point totals and dark counts (`mapKindPage`, `mapDarkPage`, ...), and the same split by sensitivity (`mapSensitiveMoney`, `mapDarkMoney`, ...). A kind absent from the project is omitted rather than sent as zero. The disclosure table from `evlog telemetry status` and the CLI telemetry docs were updated to match.
