---
"evlog": minor
---

`evlog/eve` records the caller and no longer takes the instrumentation slot for itself.

`defineEvlogInstrumentation()` now accepts `events`, merged with the runtime context it contributes. An agent has exactly one `agent/instrumentation.ts`, and other integrations want that same `step.started` slot — PostHog's links spans to the initiating user — so adopting one used to mean dropping the other. evlog's `evlog.request_id` / `evlog.session_id` are applied first and your keys win on a collision:

```ts
export default defineEvlogInstrumentation({
  setup: ({ agentName }) => registerOTel({ serviceName: agentName }),
  events: {
    'step.started': ({ session }) => ({
      runtimeContext: { 'caller.id': session.auth.current?.principalId ?? '' },
    }),
  },
})
```

Turn and session events now carry `eve.caller` with the principal eve resolved at dispatch: `principalId`, `principalType` and `authenticator`. On a multi-user channel that is the dimension you group cost, volume and refusals by, and it was previously unreachable — the enrich hook is HTTP-shaped and exposes no path to the eve session. `subject` and `attributes` are deliberately excluded, since a channel may put a name or an email in them.
