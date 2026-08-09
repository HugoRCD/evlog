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
