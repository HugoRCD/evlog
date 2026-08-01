---
"evlog": minor
---

feat(loki): add the Grafana Loki drain adapter (`evlog/loki`) — `createLokiDrain()` pushes wide events to Loki's push API, covering self-hosted single-tenant, multi-tenant (`X-Scope-OrgID`), and Grafana Cloud (instance ID + token as HTTP Basic). Each event is pushed as a JSON log line under a deliberately small label set — `service`, `environment`, `level` by default — so Loki's index stays cheap while everything else (`requestId`, `path`, custom fields) remains queryable with `| json`. Promote extra fields with `labelFields`, add deployment-wide labels with `labels`. Events sharing a label set are grouped into one stream and sorted by timestamp, since Loki rejects out-of-order entries. Configured via `LOKI_ENDPOINT` / `LOKI_API_KEY` / `LOKI_USER` / `LOKI_TENANT_ID` or overrides, with `sendToLoki` / `sendBatchToLoki` for direct use.
