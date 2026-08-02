---
"evlog": minor
---

feat: publish wide events on a `node:diagnostics_channel`

New opt-in entry point `evlog/diagnostics`. Call `enableDiagnosticsChannel()` once at startup and every emitted wide event is published on the `evlog.event` channel:

```ts
// server/plugins/evlog-diagnostics.ts
import { enableDiagnosticsChannel } from 'evlog/diagnostics'

export default defineNitroPlugin(async () => {
  await enableDiagnosticsChannel()
})
```

A consumer then subscribes by channel name alone, with no evlog import and no entry in `initLogger()`:

```ts
import { subscribe } from 'node:diagnostics_channel'

subscribe('evlog.event', ({ event }) => metrics.timing('http.request', event.durationMs))
```

`subscribeToWideEvents()` is exported for consumers that already depend on evlog and want the payload typed.

Subscribers receive the same object drains receive — post-audit, post-redaction, post-enrich — and must treat it as read-only. They run synchronously and are not awaited: this is an observation side channel, not a transport. On Cloudflare, Workers forwards every channel message to a Tail Worker, so enabling it gets wide events out of an isolate with no drain and no `waitUntil`.

Off by default, and free when off — `node:diagnostics_channel` is loaded lazily so it never enters the main bundle graph, and with the channel enabled but unsubscribed the emit path benchmarks identically to having it disabled.
