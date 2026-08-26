---
"@evlog/cli": minor
---

`evlog init` wires Hono projects. It creates `src/evlog.ts` with `initLogger` and a configured `evlog()` middleware export: drains and enrichers land in the middleware options, sampling in `initLogger`. Registering the middleware stays yours, so init prints the `app.use(evlogMiddleware)` line to paste. Hono joins the framework prompt, `--framework hono`, and init telemetry.
