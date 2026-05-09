---
'evlog': minor
---

Tag every drain request with identity headers so receivers can recognize evlog traffic and the originating adapter without parsing the body.

- `User-Agent: evlog/<version>` on Node / server runtimes (browsers strip `User-Agent`).
- `X-Evlog-Source: <adapter>` (`axiom`, `datadog`, `otlp`, `posthog`, `sentry`, `better-stack`, `hyperdx`, `client` for browser-originated drains).
- `httpPost` gains `userAgent?: string | false` and `source?: string` options so custom drains can override or suppress the headers.
- New exports from `evlog/toolkit`: `EVLOG_VERSION`, `EVLOG_USER_AGENT`, `withEvlogIdentityHeaders`.

Adapters built with `defineHttpDrain()` automatically forward their `name` as `source`. The legacy `sendBatchTo*` helpers in `evlog/axiom`, `evlog/datadog`, `evlog/otlp`, `evlog/posthog`, `evlog/sentry`, and `evlog/better-stack` pass it explicitly.
