---
"evlog": patch
---

fix(elysia): defer the wide event until a streaming body closes — `evlog/elysia` emitted from `onAfterResponse`, which fires as soon as the response is handed off. For an SSE or chunked body that is long before the stream finishes, so anything the handler set mid-stream (AI token counts, tool calls, final status) was dropped with a post-emit `[evlog]` warning. Streaming responses are now claimed in `mapResponse` and their body wrapped, so the emit waits for the stream to close — the same behaviour Hono, oRPC, SvelteKit, React Router and Next already had (#321). Non-streaming responses are unaffected and still emit immediately.
