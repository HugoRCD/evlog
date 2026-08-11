---
'@evlog/cli': patch
---

fix: `evlog map --baseline` records the CLI and rule-set versions in `evlog.map.json` and refuses to diff (exit 2) when the committed rule set does not match the running CLI, instead of reporting regressions caused by a rule change
