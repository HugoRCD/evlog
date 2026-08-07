---
"evlog": minor
---

`evlog/eve` records the caller, and composes with another observability backend.

An agent has exactly one `agent/instrumentation.ts`, and every observability item in eve's registry writes it. `defineEvlogInstrumentation()` owns that file, so it only fits an agent whose instrumentation is evlog's alone. The new `evlogRuntimeContext` contributes evlog's span attributes to instrumentation you already have, the way the other integrations do:

```ts
import { defineInstrumentation } from 'eve/instrumentation'
import { evlogRuntimeContext } from 'evlog/eve'

export default defineInstrumentation({
  setup: ({ agentName }) => registerOTel({ serviceName: agentName, spanProcessors: [...] }),
  events: {
    'step.started': input => ({
      runtimeContext: {
        ...evlogRuntimeContext(input),
        posthog_distinct_id: input.session.auth.current?.principalId ?? '',
      },
    }),
  },
})
```

It returns `undefined` outside a tracked turn, so spreading it adds nothing.

Turn and session events now carry `eve.caller` with the principal eve resolved at dispatch: `principalId`, `principalType` and `authenticator`. On a multi-user channel that is the dimension you group cost, volume and refusals by, and it was previously unreachable — the enrich hook is HTTP-shaped and exposes no path to the eve session. `subject` and `attributes` are deliberately excluded, since a channel may put a name or an email in them.
