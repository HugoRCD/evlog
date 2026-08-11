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
the CI triggers are narrow — see `.github/workflows/evi-evals.yml` for the full
list and the guards.

Evals tagged `needs-connect` are skipped in CI. They assert on GitHub calls
that must *succeed*, and GitHub is reached through Vercel Connect, which has no
token on a GitHub Actions runner — every call fails and the eval reports a
regression that is not one. Run those locally, where `vc link` supplies the
token. Two evals are in that state today; anything asserting `notCalledTool` on
a GitHub tool is unaffected and still runs.

A PR touching `agent/` (excluding tests) or an `.eval.ts` file runs the `fast`
subset automatically. That is deliberate: Evi opens PRs on her own behaviour,
and an agent cannot be relied on to label its own regression risk. Keep the PR
a draft while it is in flux — drafts never run — and add `skip-evals` when a
watched path changed but the behaviour did not.

Swapping the model goes through `EVI_MODEL`, not an edit to `agent.ts`: run the
workflow manually against the candidate, compare cost, latency and pass rate in
PostHog (`evi_eval_run`, broken down by `model`), then commit the swap.
