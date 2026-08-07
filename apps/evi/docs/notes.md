# Notes

Things that cost time to find out. Each one is why some line of this agent looks
the way it does — kept here so the code does not have to carry the paragraph.

## eve

**Authored channels report `channel:<name>`, framework ones report a bare name.**
`agent/channels/github.ts` is `channel:github`, while `http`, `schedule` and
`subagent` arrive bare. Comparing `ctx.channel.kind === 'github'` never matches,
silently. `agent/lib/channel.ts` normalizes it; both the workspace instruction
and the spend tags go through it.

**The built-in tools are not counted by `eve info`.** It reports authored tools
only, so `Tools 0` still means `bash`, `read_file`, `write_file`, `glob`, `grep`,
`web_fetch`, `todo` and `load_skill` are all present.

**Only the GitHub channel checks out the repository.** It happens before the
first model call, at the triggering ref, incrementally across turns, and only on
a firewall-capable backend. Locally and on every other channel `/workspace` is
empty. Sandbox file tools reject repo-relative paths.

**`disableTool()` is static.** There is no per-session way to remove a built-in,
so a tool that is useless on one channel still occupies context there.

**Reasoning levels are per-model.** `GET /v1/models` exposes `reasoning_options`;
DeepSeek V4 Flash advertises only `high` and `xhigh`. Setting `low` or `medium`
produced erratic, non-monotonic reasoning volume rather than an error.

**Session limits default to 40M input tokens and no output cap**, which puts one
runaway session near $8 at current prices.

**Eval runs leak sessions.** `t.succeeded()` accepts a healthy open session, so
each run leaves a `sessionTimeoutWorkflow` queued against a dead dev server. Later
runs print a growing wall of `[world-local] Queue delivery failed`. The queued
work grows every run and buries real failures in the output.

**`sessionEvent` has never been observed firing.** It emits on session
completion, which the eval runner never reaches.

## AI Gateway

**`sort: 'cost'` beats a hardcoded provider order.** Routing was landing on a
$0.20/$0.40 deployment while cheaper 1M-context ones served the same model. A
grounded turn went from $0.084 to $0.006. Sorting keeps following the price as
deployments and promos move.

**`GET /v1/models` returns the real rate card**, including `input_cache_read`.
Reconstructing an observed turn from it matched eve's reported `costUsd` to four
decimals, which is how the overspend was found.

## github-tools

**`include` without `preset` requests the union of every preset's scopes**,
`administration:write` included. Pin `connect.scopes` to what the tools call.

**The `maintainer` preset ships gist tools that always 403 over Connect** — the
Gists API rejects installation tokens — plus repo creation and merge.

**`updateIssue` also sets `state`**, so auto-approving it grants `closeIssue`
as well, since supplying `state` closes the issue. Gate on the input, not the
tool name.

**`*Context` tools collapse round-trips.** `getIssueContext` returns the issue,
its labels and recent comments in one call.

## Vercel Connect

**Connector types are not interchangeable.** The Linear channel is type `Linear`
(managed agent app plus webhooks); the Linear MCP is type `OAuth`. `eve add
linear` provisions one of each — it is one command, not one connector.

**App-scoped auth fails silently when the connector cannot mint an app token.**
Because app-scoped is non-interactive, eve never emits a challenge:
`connection_search` succeeds and reports `needsAuthorization: true` with nothing
anyone can approve, on every turn. User-scoped at least fails loudly with
`principal_required`.

**`vercel connect token` from the CLI proves nothing about app-scoped auth** — it
resolves through your own Vercel identity, the user-scoped path.

## evlog

**The fs drain guards neither its `mkdir` nor its `appendFile`.** On Vercel,
everything outside `/tmp` is read-only, so attaching it there throws once per
turn and writes events nobody can read.

**`environment` has to be set explicitly** or wide events report `development`
for both local and eval traffic while the spend tags separate them. Both now read
`agent/lib/environment.ts`.

## Open

- Per-tool input-token attribution. `ai.tools[]` records name, duration and
  success but not how much context each result added; `docs__list-pages` is ~85%
  of a grounded turn's input and it took a manual diff to establish that.
- `ai.provider` on the event. The gateway slug is recorded, the deployment that
  served it is not.
- GitHub rate-limit headers on tool results. For an agent about to run off
  webhooks, that is what breaks first and most quietly.
- A `toTelemetry(output)` mirror of `toModelOutput`, so a tool can carry
  diagnostics that never cost a context token.
