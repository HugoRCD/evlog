---
"evlog": minor
---

Close the remaining gaps in the eve integration, and add `defineEvlogInstrumentation()`.

A wide event and an Agent Runs span describe the same turn, but nothing joined them: you could not jump from a trace in Braintrust, Datadog or the Vercel dashboard to the event in your drain. Export the new definition from `agent/instrumentation.ts` and every model-call span carries `evlog.request_id` and `evlog.session_id`, the values the wide event reports as `requestId` and `eve.sessionId`:

```ts
// agent/instrumentation.ts
import { defineEvlogInstrumentation } from 'evlog/eve'

export default defineEvlogInstrumentation()
```

Without `setup`, OpenTelemetry export is untouched and eve keeps writing its local traces. `functionId`, `recordInputs`, `recordOutputs` and `traceChannelRequests` pass through to eve.

Three more of eve's stream events now reach the wide event:

- `eve.reasoning` — `blocks` and `chars`, the size of the model's thinking. The reasoning text itself is never recorded.
- `message.responseChars`, and `message.response` once `message` is `'preview'` or `'full'` — the agent's answer, following the same rule as the incoming message.
- `eve.result` — the structured result of an agent with an output schema.
