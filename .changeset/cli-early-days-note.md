---
"@evlog/cli": patch
---

Say out loud that the CLI is young. The README now carries an early-days note: `evlog map` is safe to run and covered by tests, but it has adapters for four frameworks and its rules are still being refined, so verdicts and scores can move between releases — pin the CLI as a dev dependency when a CI gate depends on the number. The command table and the `--json` examples were also brought back in line with what the command actually does today (`evlog map <route-or-file>`, the `--all` check matrix, `--verbose`, `--cwd`, and the `map` payload alongside the `doctor` one), and the docs links now point at the new CLI reference.
