---
'evlog': minor
---

Add `evlog/http` as the canonical HTTP ingest drain (`createHttpDrain`, `createHttpLogDrain`, `HttpDrainConfig`). Deprecate `evlog/browser`; it re-exports the same API and will be removed in the next **major** release.
