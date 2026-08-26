---
"evlog": patch
---

The Axiom adapter now sends the event's own `timestamp` as Axiom's `_time` via the `timestamp-field` ingest parameter, so batched and retried events keep their original time instead of being stamped at ingest. It also logs partial ingest failures and schema warnings that Axiom's ingest response can carry on a 2xx. The shared HTTP transport now retries `429` responses with backoff alongside `5xx`, which matters for Axiom's rate limits.
