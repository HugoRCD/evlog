---
"@evlog/telemetry": minor
---

Collect `env.os` (operating system platform) and `env.arch` (CPU architecture) on every run event. Both fields are nullable and the ingest validator accepts events from older clients that omit them, so no action is required — update `@evlog/telemetry` on your ingest endpoint to store the new fields.
