---
"@evlog/cli": minor
---

Let a comment turn off an `evlog map` check. A verdict you disagree with — a false positive, or a rule you have decided not to apply to one handler — now costs one comment instead of your CI gate:

```ts
// evlog-map-disable-next-line wide-event, context -- liveness probe, deliberately silent
export default defineEventHandler(() => ({ ok: true }))
```

`evlog-map-disable-line` covers the line it trails, and `evlog-map-disable` on its own covers the whole file — the right shape for a generated or vendored handler. Name several rule ids separated by commas or spaces, name none to cover every rule, and put your reason after `--`.

A disabled check is reported as `n/a` with your reason attached, so it costs no score and stops failing `--min-score`. The rule still runs: what a directive waives is the finding, so a check that would have passed is still a `pass` and the count of disabled checks is the number of verdicts you actually chose not to see. And it stays visible — the report ends with `○ 2 checks disabled by comment in 1 entry point`, the matrix marks the cell `○`, and `evlog map <file>` lists the check with its reason. In the JSON, the check carries `"suppressed": true` with `evidence` pointing at the comment, and `summary.suppressedChecks` gives the project total, so a CI job can tell how much of a green score is suppressed. A rule id no rule answers to is warned about above the report rather than silently ignored.
