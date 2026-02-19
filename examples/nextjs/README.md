# Next.js Example

Run the app locally:

```bash
bun install
bun run dev
```

Then test the endpoints:

```bash
curl http://localhost:3000/api/health
curl -X POST http://localhost:3000/api/checkout
curl http://localhost:3000/api/error
```

This example shows how to:
- Configure evlog with `createEvlog` (enrichers, sampling, routes, drain pipeline)
- Build wide events with `log.set(...)` across handler stages
- Return structured errors with `createError` (why/fix/link)
- Use `EvlogProvider` for client-side logging with `log`, `setIdentity`, `clearIdentity`
- Ingest client logs via `/api/evlog/ingest`
- Set up middleware with `evlogMiddleware` in `proxy.ts`
