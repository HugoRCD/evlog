---
'evlog': minor
---

Add `evlog/memory` — an in-memory ring buffer drain that works in any runtime, including Cloudflare Workers (workerd) where Node's `fs` module is unavailable.

```ts
import { createMemoryDrain, readMemoryLogs, clearMemoryLogs } from 'evlog/memory'

// Wire the drain
app.use(evlog({ drain: createMemoryDrain() }))

// Expose a dev-only endpoint for agent retrieval
app.get('/_evlog/logs', (c) => c.json(readMemoryLogs({ limit: 200 })))
```

Key features:
- **Zero runtime dependencies** — pure in-memory, no `fs`, no network
- **Bounded ring buffer** — configurable `maxEvents` (default `1000`) prevents unbounded memory growth
- **Named stores** — isolate buffers per service or test suite via the `store` option
- **Filtering API** — `readMemoryLogs` accepts `since`, `until`, `level`, `filter`, and `limit` options, matching the `readFsLogs` interface
- **`clearMemoryLogs(store?)`** — reset a store, useful in tests

Closes [#349](https://github.com/HugoRCD/evlog/issues/349).
