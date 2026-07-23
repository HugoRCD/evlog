---
"@evlog/telemetry": patch
---

Fix the outbox getting permanently stuck when the ingest endpoint rejects a batch with a 4xx response (oversized batch, unknown tool, schema drift on older buffered events, etc.). Previously, any non-2xx response kept the batch buffered forever, and since the whole outbox is resent together on every run, one bad batch silently blocked all future telemetry for the tool. Batches rejected with 400/401/403/404 (anything but 429, which is treated as transient) are now dropped instead of retried indefinitely.
