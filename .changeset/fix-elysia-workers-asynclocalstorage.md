---
"evlog": patch
---

# fix(elysia): support Cloudflare Workers without AsyncLocalStorage.enterWith

Cloudflare Workers omit native `AsyncLocalStorage.enterWith()`. The Elysia integration now installs a small polyfill on load so `useLogger()` keeps working in typical `wrangler dev` flows. `{ log }` from derive remains the safest option when multiple requests may interleave in the same isolate.

Closes #394
