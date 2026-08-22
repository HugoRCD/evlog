---
"evlog": minor
---

Wrapping an adapter drain in `createDrainPipeline` now behaves as documented. Adapter drains swallow delivery failures so they never break a request, which silently disabled the pipeline's `retry` and `onDropped` and stacked the adapter's internal HTTP retries on top of the pipeline's. Drains built with `defineDrain` / `defineHttpDrain` now expose a throwing `raw` variant that performs a single attempt unless retries are explicitly configured, and the pipeline picks it up automatically: `retry` and `onDropped` observe real failures, and one layer owns retrying. A batch dropped with no `onDropped` configured is logged instead of vanishing.

On serverless runtimes the pipeline no longer strands buffered events. It exposes `settled()`, which resolves once everything buffered so far has been delivered or dropped, and the shared middleware registers it with the runtime's `waitUntil` (Next's `after()`, Workers' `ctx.waitUntil`) so the instance is not frozen while a batch sits in the buffer.
