---
"evlog": minor
---

feat(workers): add `withEvlog()` so Cloudflare Workers get the full middleware pipeline — `evlog/workers` was the only integration that never ran `createMiddlewareLogger`, so `include` / `exclude`, per-route `routes` overrides, `redact`, `enrich`, `keep` tail sampling and `plugins` simply had no effect there. Wrap your fetch handler with `withEvlog(handler, options)` and the wide event is emitted for you when the handler returns, with the same option surface every other framework accepts; `ctx.waitUntil` is picked up from the third argument so drains outlive the response, streaming bodies defer the emit until they complete, and `requestId` now honours `x-request-id` before falling back to `cf-ray`. `defineWorkerFetch()` and `createWorkersLogger()` are unchanged and remain the manual-emit path. The entrypoint stays free of `node:async_hooks`, so it still runs without `nodejs_compat`
