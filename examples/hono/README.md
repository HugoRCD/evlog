# Hono Example

Run the app locally:

```bash
pnpm install
pnpm run dev
```

Then test the endpoints:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/checkout
```

This example shows how to:
- Initialize `evlog` in a Hono app using `initLogger`
- Create one wide event per request in middleware with `createRequestLogger`
- Add route context with `log.set(...)`
- Return structured error metadata with `createError` + `parseError`
