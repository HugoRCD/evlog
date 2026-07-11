---
"evlog": minor
---

Add AI SDK v7 `LanguageModelV4` wrap/middleware support in `evlog/ai`. `createAILogger().wrap()` and `createAIMiddleware()` now use V4-native middleware (`specificationVersion: 'v4'`) while still accepting V3 models (AI SDK upgrades them via `wrapLanguageModel`). `wrap()` is typed against `LanguageModel` from `ai`, so V3, V4, and gateway model strings all type-check on AI SDK v7.
