---
'evlog': minor
---

Add `waitUntil` support to `createMiddlewareLogger` and `defineFrameworkIntegration` so custom framework integrations can defer async drains on Cloudflare Workers and Vercel Edge without blocking the response. Pass `waitUntil` per request (e.g. `ctx.waitUntil.bind(ctx)`) or declare `extractWaitUntil` on the integration manifest.
