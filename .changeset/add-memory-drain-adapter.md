---
'evlog': minor
---

Add `evlog/memory` — an in-memory ring buffer drain that works in any runtime, including Cloudflare Workers (workerd) where Node's `fs` module is unavailable.

```ts
import { createMemoryDrain, readMemoryLogs, clearMemoryLogs, parseReadMemoryLogsQuery } from 'evlog/memory'

// Wire the drain
app.use(evlog({ drain: createMemoryDrain() }))

// Expose a dev-only endpoint — agents can filter via query params
app.get('/_evlog/logs', (c) =>
  c.json(readMemoryLogs(parseReadMemoryLogsQuery(c.req.query()))))
```

Key features:
- **Zero runtime dependencies** — pure in-memory, no `fs`, no network
- **Bounded ring buffer** — configurable `maxEvents` (default `1000`) prevents unbounded memory growth
- **Named stores** — isolate buffers per service or test suite via the `store` option
- **Filtering API** — `readMemoryLogs` accepts `since`, `until`, `level`, `filter`, and `limit` options, matching the `readFsLogs` interface
- **`parseReadMemoryLogsQuery(query)`** — coerce HTTP query-string params (`Record<string, string>`) into typed `ReadMemoryLogsOptions`; works with Hono, h3/Nitro, Express, Fastify, Next.js, Elysia, NestJS
- **`clearMemoryLogs(store?)`** — reset a store, useful in tests
- **Environment variables** — `NUXT_EVLOG_MEMORY_STORE` / `EVLOG_MEMORY_STORE`, `NUXT_EVLOG_MEMORY_MAX_EVENTS` / `EVLOG_MEMORY_MAX_EVENTS` (via `resolveAdapterConfig`)
- **Nuxt module** — `ModuleOptions.axiom` now documents `apiKey` as the canonical field; legacy `token` remains as a deprecated alias until the next major release

Closes [#349](https://github.com/HugoRCD/evlog/issues/349).
