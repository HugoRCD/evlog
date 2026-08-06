---
"@evlog/eve": minor
"evlog": patch
---

Add `@evlog/eve`, evlog packaged as an installable eve extension.

Mounting it replaces writing `agent/hooks/evlog.ts` by hand:

```ts
// agent/extensions/evlog.ts
import evlog from '@evlog/eve'

export default evlog({ adapter: 'axiom', sample: 0.1 })
```

The mount config is declarative — an adapter by name (or several, which fan out), a sampling rate, redaction paths, batching — because eve validates extension config synchronously and it therefore cannot carry functions. Agents that need a custom `drain`, `enrich` or `keep` keep using `defineEvlogHook` from `evlog/eve`.

The extension also contributes what a hook cannot: an `annotate` tool and a skill that teach the agent to record its own business context on the turn's event, and to keep message content and personal data out of it.

`defineEvlogHook` now warns when it runs more than once in a process. Every hook accumulates into the same turn, so mounting the extension alongside a hand-written hook records token and step counts once per hook.
