---
"evlog": minor
---

Add Datadog Logs HTTP drain adapter (`evlog/datadog`): `createDatadogDrain()`, `sendToDatadog` / `sendBatchToDatadog`, env vars `DD_API_KEY` / `NUXT_DATADOG_*` / `DD_SITE`, and intake URL for all Datadog sites. Maps wide events with a short `message` line, full payload under `evlog`, severity `status`, and recursive `httpStatusCode` renaming so HTTP `status` fields never clash with Datadog’s reserved severity ([EVL-144](https://linear.app/evlog/issue/EVL-144)).
