---
"@evlog/cli": minor
---

Introduce the evlog CLI (`@evlog/cli`, binary `evlog`). First release ships `evlog doctor` — diagnoses your setup (Node version, evlog install, local `.evlog/logs` sink) with a branded terminal report or `--json` output — plus `evlog telemetry status|enable|disable`. One anonymous wide event per command via `@evlog/telemetry`; opt out with `evlog telemetry disable` or `DO_NOT_TRACK=1`.
