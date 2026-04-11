# Browser Drain Example

A mini store demo that shows `evlog/http` in action — browser logs are sent to a Hono server via `createHttpLogDrain`.

## Setup

```bash
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000), interact with the store, and check your terminal for `[BROWSER]` output.

## How it works

- `src/client.ts` — initializes `createHttpLogDrain` once, then uses `log.info` / `log.error` on user interactions
- `src/server.ts` — Hono server with a `POST /v1/ingest` endpoint that receives and logs `DrainContext[]` batches
- `esbuild` bundles the client into a single JS file served to the browser
