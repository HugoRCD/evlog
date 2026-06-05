---
'evlog': minor
---

Add `createNitroAIStreamLogger()` from `evlog/ai/nitro` for Nuxt/Nitro AI SDK streaming responses. The helper records stream metadata on a correlated child event and sends it through the normal Nitro enrich/drain hooks, avoiding post-emit warnings when the parent request event has already completed.
