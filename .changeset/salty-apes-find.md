---
"evlog": patch
---

fix(hono): resolve "ReadableStream is locked" error with AI SDK streaming responses

Using `createUIMessageStreamResponse` or `createAgentUIStreamResponse` from the Vercel AI SDK inside a Hono route would throw `ERR_INVALID_STATE: ReadableStream is locked` when running under `@hono/node-server`.

**Root cause:** The middleware called `createObservedBody(c.res.body)` (which calls `body.getReader()`, locking the stream) and then relied on Hono's `compose` to update `c.res` with the wrapped response via the middleware return value. However, Hono skips that update when `context.finalized` is already `true` — which is always the case after a route handler returns a `Response`. This left `c.res` pointing at the original response whose body was now locked, so `@hono/node-server`'s subsequent `response.body.getReader()` call threw.

**Fix:** Explicitly assign `c.res = await finishResponse(c.res, ...)` instead of returning the wrapped response, so `c.res` is always updated regardless of `context.finalized`.

Closes #382
