---
"evlog": minor
---

Add `defineEvlogInstrumentation()` to `evlog/eve`, linking eve's OpenTelemetry spans to evlog wide events.

A wide event and an Agent Runs span describe the same turn, but nothing joined them: you could not jump from a trace in Braintrust, Datadog or the Vercel dashboard to the event in your drain. Export it as the default export of `agent/instrumentation.ts` and every model-call span — and its children — carries `evlog.request_id` and `evlog.session_id`, the same values the wide event reports.

```ts
// agent/instrumentation.ts
import { defineEvlogInstrumentation } from 'evlog/eve'
import { registerOTel } from '@vercel/otel'

export default defineEvlogInstrumentation({
  setup: ({ agentName }) => registerOTel({ serviceName: agentName }),
})
```

`setup` is optional: without it, OpenTelemetry export is untouched and eve keeps recording its local traces, with only the runtime context added. `functionId`, `recordInputs`, `recordOutputs` and `traceChannelRequests` pass straight through to eve.
