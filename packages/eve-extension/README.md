# @evlog/eve

[evlog](https://evlog.dev) packaged as an [eve](https://eve.dev) extension: one
wide event per agent turn, sent to the destination of your choice, without
writing a hook.

## Install

```bash
pnpm add @evlog/eve
```

```ts
// agent/extensions/evlog.ts
import evlog from '@evlog/eve'

export default evlog({ adapter: 'axiom', sample: 0.1 })
```

That is the whole setup. Every turn now produces an event carrying token usage,
cost, tool executions, subagent delegations, approvals, connection
authorizations, compactions and failures.

## Config

| Option | Default | What it does |
| --- | --- | --- |
| `adapter` | `'fs'` | Destination by name, or `{ type, options }`. An array fans out. |
| `service` | agent name | Service name on every event. |
| `message` | `'omit'` | `'omit'`, `'preview'` or `'full'` user message capture. |
| `messagePreviewLength` | `500` | Characters kept in `'preview'`. |
| `redact` | `true` | Built-in PII patterns, or `{ paths }`. |
| `sample` | keep all | Fraction of routine turns to keep, 0 to 1. |
| `keepOnFailure` | `true` | Always keep failed, rejected and declined turns. |
| `sessionEvent` | `false` | One extra event per session, rolling up its turns. |
| `batch` | none | `{ size, intervalMs }` buffering before draining. |

Adapters read their own environment variables, so `adapter: 'axiom'` with
`AXIOM_TOKEN` and `AXIOM_DATASET` set is usually all you need. `options`
overrides what the environment cannot express.

Available adapters: `axiom`, `better-stack`, `clickhouse`, `datadog`, `fs`,
`hyperdx`, `loki`, `memory`, `otlp`, `posthog`, `sentry`.

## What the agent can do itself

The mount contributes an `annotate` tool (namespaced `evlog__annotate` for a
mount named `evlog.ts`) and a skill teaching the agent when to use it. The agent
records business facts on its own turn:

```
annotate({ key: "refund", value: { amount: 89.9, reason: "damaged_on_arrival" } })
```

Those fields are what make a turn findable later. The skill also tells the agent
what never to record: message content, credentials, personal data.

## When to use the hook instead

The mount config is validated synchronously, so it cannot carry functions. If
you need a custom `drain`, `enrich` or `keep`, skip the extension and use the
hook directly:

```ts
// agent/hooks/evlog.ts
import { defineEvlogHook } from 'evlog/eve'

export default defineEvlogHook({
  drain: myDrain,
  enrich: ctx => void (ctx.event.region = process.env.VERCEL_REGION),
})
```

Use one or the other. Mounting both makes every hook accumulate into the same
turn, which records token and step counts once per hook.

## Correlating with OpenTelemetry

`evlog/eve` also exports `defineEvlogInstrumentation()`, which stamps
`evlog.request_id` onto eve's AI SDK spans so a trace joins back to the wide
event. See the [eve integration docs](https://evlog.dev/use-cases/eve).

## License

MIT
