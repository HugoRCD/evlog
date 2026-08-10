# eve Agent App

This project uses the eve framework. Before writing code, read the relevant guide
from the installed eve package docs. In most installs, those docs are at
`node_modules/eve/docs/`. In workspaces or local package installs, resolve the
installed `eve` package location first and read its `docs/` directory. If
package docs are unavailable, use https://eve.dev/docs as a fallback.

Before implementing an integration yourself, use
`eve registry search <query>` or `eve registry list` to discover available
integrations. Inspect one with `eve registry view <item>`, then install it with
`eve add <item>`.

Before adding a capability (tool, connection, skill, schedule, subagent), read
`docs/capability-placement.md`: it decides where the capability lives and holds
the two-layer rule (files under `agent/` are wiring; logic goes in `agent/lib/`
with a colocated test).

## Evals cost real money

`pnpm eval` runs the agent against a live model. Twenty evals is a real bill, so
CI never runs them on its own initiative — see `.github/workflows/evi-evals.yml`
for what triggers a run.

Changing anything under `agent/` that alters behaviour, cost, or latency
(instructions, tools, skills, model, reasoning effort) is what the suite exists
to catch: label the PR `evals` to run the `fast` subset before merging. Wording
and test-only changes do not need it — a push to main that touches `agent/`
runs the full suite anyway.

Swapping the model goes through `EVI_MODEL`, not an edit to `agent.ts`: run the
workflow manually against the candidate, compare cost, latency and pass rate in
PostHog (`evi_eval_run`, broken down by `model`), then commit the swap.
