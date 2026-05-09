---
'evlog': minor
---

Add a local Server-Sent Events stream server so any consumer (browser tab, CLI, devtool) can subscribe to live wide events without going through your app's API surface. The server runs in the same Node process on its own ephemeral port; the URL is printed at startup and written to `.evlog/stream.url` for tools to discover.

Strict opt-in — nothing starts unless you set `stream` explicitly.

**Nuxt**

```ts [nuxt.config.ts]
evlog: {
  stream: true,
  // or: stream: { port: 4317, token: process.env.EVLOG_STREAM_TOKEN }
}
```

**Next.js** — new helper in `evlog/next/stream`:

```ts [lib/evlog.ts]
import { defineStreamedInstrumentation } from 'evlog/next/stream'

export const { register, onRequestError } = defineStreamedInstrumentation({
  service: 'my-app',
  stream: true,
})
```

**Standalone / any framework**:

```ts
import { startStreamServer } from 'evlog/stream'

const server = await startStreamServer()
// pass server.drain wherever you compose your evlog drain
```

The Nuxt module also registers a tiny `/api/_evlog/stream-info` route that returns the mini-server URL so a same-origin browser tab can discover the ephemeral port.

API surface in `evlog/stream`:

- `startStreamServer(options): Promise<StreamServer>` — `node:http` server bound to `127.0.0.1` by default, idempotent, lazy-imports Node-only modules so `evlog/stream` stays edge-friendly for the in-process primitive.
- `StreamServerOptions`: `port`, `host`, `token`, `heartbeatMs`, `buffer`, `banner`, `urlFileDir`.
- `StreamServer`: `{ url, port, drain, stream, close }`.
- Cleans up `.evlog/stream.url` and listeners on `close()` + `SIGINT` / `SIGTERM` / `exit`.

Wire format is a versioned JSON envelope `{ evlog: "1", type, data }` with frames `hello`, `replay`, `event`, and `ping`.

**Local-only by design.** The server is in-process — on serverless platforms (Vercel Functions, Cloudflare Workers, AWS Lambda) each invocation is isolated, so a subscriber would only see events from its own isolate. Use a real broker for cross-instance fan-out in those environments.
