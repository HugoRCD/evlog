# Observability

What Evi records today, what it cannot, and the gaps worth closing upstream.

## What works

`agent/hooks/evlog.ts` emits one evlog wide event per turn. A turn event carries
`eve.{sessionId,turnId,turnSequence,sessionTurns,runtime,reasoning}`,
`ai.{calls,steps,inputTokens,outputTokens,cacheReadTokens,costUsd,model,tools[],finishReason}`,
`channel.kind`, `status`, `durationMs`, plus `service` and `environment`.

That is enough to answer, from the log alone: what a turn cost, which tools it
called and whether each succeeded, how much of the context was cache-served, and
which surface it came from. Every cost claim in this project was measured from
these events rather than estimated.

`environment` comes from `agent/lib/environment.ts`, the same function that
builds the gateway spend tags. That is deliberate: a run that bills as `eval`
also logs as `eval`, so the two views line up. Before, wide events reported
`development` for both eval and local traffic while the spend report separated
them — the kind of drift that makes a dashboard quietly lie.

The fs drain only attaches where there is a durable disk. On Vercel everything
outside `/tmp` is read-only and `createFsDrain` guards neither its `mkdir` nor
its `appendFile`, so shipping it there would throw once per turn and write events
nobody could read. Hosted, stdout is the transport and the platform captures it.

`agent/instrumentation.ts` enables eve's OpenTelemetry surface. Without that file
there is no span tree at all — the Agent Runs tab is fed by Workflow run tags,
which are a separate system. With it, a turn produces `ai.eve.turn` →
`ai.streamText` per step → `ai.streamText.doStream` and `ai.toolCall` per tool.
That is the only place per-tool timing and per-step model input are visible; the
wide event says a turn called six tools, the span tree says which step each ran
in and what the model saw first. `defineEvlogInstrumentation` stamps
`evlog.request_id` and `evlog.session_id` on every span, so a slow span resolves
to its wide event and back. No `setup` is registered, so eve keeps traces local
until a backend is chosen.

## Not yet verified

`sessionEvent: true` is set but has never been observed firing. It emits on
`session.completed` / `session.failed`, and the eval runner leaves sessions open
by design, so 17 turn events across a full suite produced zero rollups. It is
configured, not confirmed. Check it against a real GitHub thread that ends.

## The gap: nothing identifies the caller

A turn event says what happened and what it cost. It does not say **who asked**.
On a repository bot that is the dimension you most want to group by — cost per
user, volume per user, refusals per user, and after the tier work in
[authorization.md](./authorization.md), which tier a turn ran at.

This is not an oversight in the configuration; there is no supported path.
`evlog/eve` builds the event from the eve stream, and the enrich hook it exposes
is HTTP-shaped — `{ event, request, headers, response }` — with no reference to
the eve session, so `session.auth` is unreachable from it. Three attempts, all
from an authored eve hook calling `useLogger().set({ caller })`:

| Approach | Turns annotated |
| --- | --- |
| `useLogger()` on `turn.started` | 1 of 2 |
| `useLogger({ session: { id, turn } })` on `turn.started` | 0 of 16 |
| `useLogger()` on `step.started` | 1 of 16 |

The documented contract for `useLogger()` is a tool `execute()` handler, where
AsyncLocalStorage is guaranteed bound. Hooks sit outside it, and the evlog hook
registers the turn logger on `turn.started` itself, so two hooks race on the same
event. The attempt was removed rather than shipped: an annotation present on 6%
of turns is worse than none, because it looks like data and is a biased sample.

`evlog/eve` now records `eve.caller` itself, and `agent/instrumentation.ts` puts
the same principal on the spans. Two things follow from that. The principal is a
stable per-person identifier duplicated across logs and traces, so it inherits
whatever retention the drain has — decide that before adding a drain that keeps
events longer than the platform does. And an unauthenticated caller is omitted
rather than written blank: an empty attribute reads as a caller whose id happens
to be empty.

## Proposals

### evlog/eve — let `defineEvlogInstrumentation` take `events`

The sharpest one, and it half-unblocks the caller gap. eve *does* support
per-model-call attribution: `events["step.started"]` in `instrumentation.ts`
receives `{ session, turn, step, channel, modelInput }` — including
`session.auth` — and whatever it returns under `runtimeContext` rides onto the
spans. That is the supported path the hook attempts above were groping for.

But `defineEvlogInstrumentation` hardcodes that slot to inject its own
correlation ids and exposes no passthrough:

```ts
// packages/evlog/src/eve/index.ts
events: { 'step.started': buildInstrumentationContext },
```

So a consumer must choose between evlog correlation and their own runtime
context. Merging the two is a few lines:

```ts
'step.started': (input) => {
  const base = buildInstrumentationContext(input)
  const extra = options.events?.['step.started']?.(input)
  if (!base && !extra) return undefined
  return { runtimeContext: { ...base?.runtimeContext, ...extra?.runtimeContext } }
},
```

With that, `caller.principal_id` lands on every span for free.

### evlog/eve — reach the eve session from enrichment

Spans are not the wide event. Grouping cost per user still means the caller has
to reach `enrich`, whose context is HTTP-shaped. Either widen it for the eve
integration to carry the eve session, or expose a turn-scoped callback that runs
where the logger is known to exist:

```ts
defineEvlogHook({
  enrichTurn: (ctx) => ({ caller: ctx.session.auth.current?.principalId }),
})
```

Anything that avoids making consumers guess at hook ordering. Every agent on a
multi-user channel wants this, not just this one.

### evlog/eve — attribute input tokens to the tool that caused them

`ai.tools[]` records `name`, `durationMs`, `success`. It does not record how much
context each result added. A grounded turn here costs ~74k input tokens, and it
took a manual before/after comparison to establish that `docs__list-pages` was
~85% of it. An input-token delta per tool result would have made that the first
thing anyone noticed, and it generalises: the most common way an agent gets
expensive is one tool returning too much, every turn.

### evlog/eve — record the resolved provider

`ai.model` is the gateway slug. It does not say which deployment served the call.
Routing here was landing on a $0.20/$0.40 provider when $0.09/$0.18 ones served
the same model; finding that meant reconstructing the rate card from observed
totals and matching it against the model catalogue. An `ai.provider` field turns
a 55% overspend into something you read off a dashboard.

### github-tools — surface GitHub rate-limit state on tool results

Every GitHub API response carries `x-ratelimit-remaining`, `x-ratelimit-limit`
and `x-ratelimit-reset`. None of it reaches the agent or the log. For a bot about
to run autonomously off webhooks, the rate limit is what breaks first and most
silently — turns just start failing.

The plumbing to consume it already exists and needs nothing from eve. A hook can
narrow a tool result to a specific extension tool with full typing, including for
a mounted extension, because `toolResultFrom` keys off the tool definition rather
than the namespaced name:

```ts
import { searchCode } from '@github-tools/eve-extension/tools'

'action.result'(event) {
  const result = toolResultFrom(event.data.result, searchCode)
  if (result) useLogger().set({ github: { remaining: result.output.rateLimit?.remaining } })
}
```

So the whole ask is on the github-tools side: **put the rate-limit headers on the
tool output**. Ideally behind a flag, or on a side channel the model never sees —
a `remaining` count in every result is context the model does not need and would
occasionally reason about.

That last point generalises into a nicer primitive worth considering in eve:
`toModelOutput` already shapes what the model sees. Its mirror — something like
`toTelemetry(output)` — would shape what hooks and drains see, letting a tool
carry rich diagnostics that never cost a context token. Today the two audiences
share one payload, so every field is a tradeoff between observability and prompt
size.

### github-tools — per-session tool scoping

Described in [authorization.md](./authorization.md) as a security fix. It is also
an observability one: with a caller-dependent surface, the log records which
tools a given tier actually had, so "Evi refused" and "Evi never had the tool"
stop looking identical.

### eve — eval runs leak sessions into the local world

`pnpm eval` leaves every session it opened alive: `t.succeeded()` accepts a
healthy open session by design. Each one keeps a `sessionTimeoutWorkflow` queued
against a dev server that no longer exists, so subsequent runs print a growing
wall of `[world-local] Queue delivery failed ... TypeError: fetch failed`. It
reached 409 lines on a 16-eval run here, and it grows with every run.

The queued work grows with every run and buries real failures in the output, so
it costs signal rather than correctness. Either the eval runner should close the
sessions it opened, or the local world should discard messages whose target run
is gone. A related one-off also appears: `Cannot set attributes on run in
terminal state "completed"`.

## When volume justifies it

Nothing here samples: every turn is kept. That is correct at current volume and
would not be at 100x. `defineEvlogHook` takes a `keep` predicate for tail
sampling — the shape to reach for is retain-everything-interesting: tool
failures, step failures, approvals, authorizations, and turns above a cost
threshold, sampling the rest. Adding it before there is volume to shed would just
throw away data.
