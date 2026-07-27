---
"@evlog/cli": minor
---

feat(cli): add `evlog map --baseline` — gates a pull request on regressions against the committed `evlog.map.json` instead of an absolute threshold, which keeps CI honest across releases that move the rules. Compares per check: a requirement going from pass to fail gates, and so does silencing one with a disable comment. New dark entry points are reported without failing (`--min-score` is the bar for new work). Reads a local file or `git:<ref>` — no network, no repository access, so it behaves the same on a private repo. A run that reports a regression leaves the map file untouched rather than ratcheting the baseline down to the worse state
