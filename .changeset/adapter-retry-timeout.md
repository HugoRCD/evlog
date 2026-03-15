---
"evlog": patch
---

Add retry with exponential backoff to all HTTP drain adapters and improve timeout error messages.

- Transient failures (timeouts, network errors, 5xx) are retried up to 2 times with exponential backoff (200ms, 400ms)
- `AbortError` timeout errors now display a clear message: `"Axiom request timed out after 5000ms"` instead of the cryptic `"DOMException [AbortError]: This operation was aborted"`
- New `retries` option on all adapter configs (Axiom, OTLP, Sentry, PostHog, Better Stack)
- 4xx client errors are never retried
