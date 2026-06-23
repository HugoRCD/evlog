---
"evlog": patch
---

# fix(elysia): support Cloudflare Workers without AsyncLocalStorage.enterWith

Cloudflare Workers omit native `AsyncLocalStorage.enterWith()`. The Elysia integration now installs a small polyfill on load so `useLogger()` and `{ log }` keep working under `wrangler dev`.

Closes #394
