---
"evlog": minor
---

fix(datadog): lift `event.traceId` / `event.spanId` into a root `dd` block — Datadog's log-to-trace correlation only reads `dd.trace_id` / `dd.span_id` at the payload root, so the ids `createDefaultEnrichers()` already sets arrived nested under `evlog` and never correlated. The nested copy stays, so `@evlog.*` facets keep working, and `resolveDatadogTraceContext` is exported for custom drains
