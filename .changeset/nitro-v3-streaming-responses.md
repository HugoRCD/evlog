---
"evlog": patch
---

Fix the Nitro v3 response hook breaking every streaming response (SSE, NDJSON, and `transfer-encoding: chunked` — which includes all tRPC v11 `httpBatchStreamLink` traffic). The hook locked the original response body via `getReader()` and assigned the wrapped response to `event.res`, which is a getter-only accessor on h3 v2, producing `Attempted to assign to readonly property` followed by `ReadableStream is locked` and a 500 for the client. Streaming responses now pass through untouched and the wide event is emitted at header time; stream-lifetime metrics are not observable from h3 v2's `onResponse` hook, which cannot replace the outgoing response.
