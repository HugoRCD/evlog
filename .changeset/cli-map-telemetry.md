---
"@evlog/cli": minor
---

Record what a `map` scan found, and more of what `doctor` diagnosed.

`evlog map` reported nothing at all. It now records the shape of a scan: the score and its grade, entry point counts split by coverage, the detected framework, which gate ran and whether it failed the command, and — per rule — how many entry points failed it against how many waived it with an `evlog-map-disable` comment.

Rule ids are the CLI's own closed set and are already public. Everything read out of your source is a count — no route path, no file name, no project name, no snippet. `evlog telemetry status` prints the full field list, and `evlog telemetry disable`, `EVLOG_TELEMETRY=0` or `DO_NOT_TRACK=1` turn all of it off.

`evlog doctor` additionally reports how many checks passed, whether evlog resolved, whether a logs sink was found, and how many stack entries were detected.
