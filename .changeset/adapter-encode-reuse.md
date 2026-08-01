---
"evlog": minor
---

refactor: build each adapter's HTTP request once instead of twice — every HTTP adapter (`axiom`, `better-stack`, `datadog`, `otlp`, `sentry`, `posthog` in `events` mode) constructed its URL, headers and body in two places: the `encode()` passed to `defineHttpDrain()` and again inside its standalone `sendBatchTo*` helper. The two copies had already drifted, reporting the same failure under different names (`axiom API error` from the drain, `Axiom API error` from the helper), and Axiom's and Better Stack's `encode()` ignored the deprecated `token` / `sourceToken` aliases the helper honoured. Both paths now share one encoder per adapter and report failures identically. `defineHttpDrain()` accepts an optional `label` for the human-readable name used in error messages, and `sendEncodedDrainRequest()` is exported from `evlog/toolkit` so custom adapters can reuse their own encoder the same way
