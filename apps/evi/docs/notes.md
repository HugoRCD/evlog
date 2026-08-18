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

**iMessage attachments need a second spectrum round-trip on the webhook path.**
The Photon adapter's chat mapping keeps name/mimeType/size, and eve's
`messageToUserContent` only reads `attachment.url`, which Photon never has. On
the connected (pump) path the parsed content nodes with their authenticated
`read()` survive on `message.raw.content`; on the webhook path `raw` is the
delivery JSON, which never carries them, so `patches/eve@0.34.0.patch` calls
`adapter.fetchMessage()` to re-resolve the message through the spectrum client
and reads the images from the resolved nodes. On an eve upgrade the patch must
be re-applied or retired.

**Reasoning levels are per-model.** `GET /v1/models` exposes `reasoning_options`;
DeepSeek V4 Flash advertises only `high` and `xhigh`. Setting `low` or `medium`
produced erratic, non-monotonic reasoning volume rather than an error.

**Session limits default to 40M input tokens and no output cap**, which puts one
runaway session near $8 at current prices.

**Eval runs leak sessions.** `t.succeeded()` accepts a healthy open session, so
each run leaves a `sessionTimeoutWorkflow` queued against a dead dev server. Later
runs print a growing wall of `[world-local] Queue delivery failed`. The queued
work grows every run and obscures real failures in the output.

**`sessionEvent` has never been observed firing.** It emits on session
completion, which the eval runner never reaches.

### Dynamic tools: executes stay inline

eve's bundler transform registers a dynamic tool's `execute` as a durable step
function only when the function sits inline in the resolver body. A tool map
built by a factory (`return myTools()`) type-checks and works on a fresh
session, then fails on any resumed session with `references step function
"..." which is not registered`. An implicit arrow return (`() => ({ ... })`)
defeats the transform the same way; the resolver needs a block body with an
explicit `return`. Every `agent/tools/*.ts` dynamic file therefore defines
its tools inline in a single block-bodied `turn.started` resolver.

## Schedules

**Chat-sdk channels target a provider-native `threadId` from a schedule.**
`to(photon, target).send(...)` takes `{ adapterName: 'imessage', threadId }`, not
a session handle. For a direct chat the id is derivable, no capture needed:
Spectrum direct-chat guids are `any;-;<address>`, so the thread is
`imessage:any;-;<phone>`. The optional `~<phone>` suffix in the full format
selects the sending line; irrelevant while the Photon project has one number.

**Vercel evaluates schedule cron in UTC.** `0 5 * * *` fires 06:00 London in
summer (BST) and drifts to 05:00 in winter (GMT). `eve dev` never fires crons;
`POST /eve/v1/dev/schedules/digest` triggers one locally.

**The upstream-sync and self-review schedule turns push feature branches
without an approval card.** The push is inert: it only creates a branch, `validatePushBranch`
refuses `main`/`master`, and the draft PR referencing the branch carries the
card. Schedule turns are `eve:app`, not the maintainer, so
`github__createPullRequest` still posts an approval card to the thread.

## AI Gateway

**`sort: 'cost'` beats a hardcoded provider order.** Routing was landing on a
$0.20/$0.40 deployment while cheaper 1M-context ones served the same model. A
grounded turn went from $0.084 to $0.006. Sorting keeps following the price as
deployments and promos move.

**`GET /v1/models` returns the real rate card**, including `input_cache_read`.
Reconstructing an observed turn from it matched eve's reported `costUsd` to four
decimals, which is how the overspend was found.

**`group_by: tag` on the report returns one row per tag value.** Scoped to
`evi:env:*`, that is the env total row plus one `evi:surface:*` row per surface,
each with cost, token and `request_count` columns, so the surface breakdown and
the per-model mix (`group_by: model`) are two calls away. The cost-watchdog
skill reads both; the surface set must be taken from the rows, never assumed.

## github-tools

**The `maintainer` preset ships gist tools that always 403 over Connect** — the
Gists API rejects installation tokens — plus repo creation and merge.

**`updateIssue` also sets `state`**, so auto-approving it grants `closeIssue` as
well, since supplying `state` closes the issue. Gate on the input, not the tool
name.

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

**A misconfigured OAuth connection does not degrade, it breaks the whole run.**
On EVL-213, the Linear MCP connection took every GitHub tool down with it: five
calls, all `Cannot read properties of undefined (reading 'toLowerCase')`, thrown
from `isProvisionableConnectorUid` in
`@vercel/connect/dist/eve/provision-oauth-connector.js`. Local evals never saw it
because `provisionEveOAuthConnector` returns early without an OIDC token; in
production it runs. The connection is removed until Connect can mint the token —
assuming the agent simply answers without that connection is wrong.

**`vercel connect token` from the CLI proves nothing about app-scoped auth** — it
resolves through your own Vercel identity, the user-scoped path.

## Telemetry

**The agent's telemetry MCP authenticates with its Vercel OIDC token, not a
shared password.** The connection sends `process.env.VERCEL_OIDC_TOKEN` (the
same token the turbo remote-cache tool uses); the telemetry app verifies it
against Vercel's team JWKS and trusts only the `evi` project's production
environment (`apps/telemetry/server/utils/vercel-oidc.ts`). Locally there is no
OIDC token, and the dashboard's soft auth means a password-less local dashboard
stays open. If the evi project's OIDC issuer mode ever changes, the constants in
`vercel-oidc.ts` move with it.

## evlog

**The fs drain guards neither its `mkdir` nor its `appendFile`.** On Vercel,
everything outside `/tmp` is read-only, so attaching it there throws once per
turn and writes events nobody can read.

**`environment` has to be set explicitly** or wide events report `development`
for both local and eval traffic while the spend tags separate them. Both now read
`agent/lib/environment.ts`.

## MCP channel

External harnesses (Raycast AI, Claude Code, Cursor) reach Evi at
`/eve/v1/mcp` with `Authorization: Bearer $EVI_MCP_TOKEN`, served by eve's
native MCP channel (`mcpChannel`). Clients get the durable invocation tools —
`agent_start`, `agent_get`, `agent_update`, `agent_cancel`: start returns an
invocation id immediately, the harness polls `agent_get`, and human-input
requests surface as `input_required` instead of a hanging HTTP call. Each
`agent_start` is one task-mode session owned by the `mcp:hugo` principal,
trusted as the maintainer only while the token env is set; there is no
cross-call conversation, so a request must carry its own context. Setup:
generate a token (`openssl rand -hex 32`), set `EVI_MCP_TOKEN` on the project,
add an HTTP MCP server in the client pointing at the production URL with the
Authorization header. Rotate by changing the env var. There is no OAuth AS on
purpose: single-user surface, a static bearer is the right size.

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
