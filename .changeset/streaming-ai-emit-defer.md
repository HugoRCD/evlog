---
'evlog': minor
---

Defer wide-event emit for streaming HTTP responses (SSE, AI SDK UI streams, chunked bodies) until the response body finishes, so `createAILogger()` metadata is included on the same request event instead of triggering post-emit warnings.

Applies to Next.js `withEvlog`, SvelteKit, Hono, React Router, oRPC, and Nitro/Nuxt integrations. Also merges late `ai` fields onto an emitted event before enrich/drain when metadata arrives in a narrow race window.

Fixes #321
