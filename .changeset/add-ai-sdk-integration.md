---
"evlog": minor
---

Add `evlog/ai` integration for AI SDK v6+ observability.

- `createAILogger(log)` returns an `AILogger` with `wrap()` and `captureEmbed()`
- Model middleware captures token usage, tool calls, finish reason, and streaming metrics
- Supports `generateText`, `streamText`, `generateObject`, `streamObject`, and `ToolLoopAgent`
- Accumulates data across multi-step agent runs (steps, models, tokens)
- String model IDs resolved via `gateway()` with full autocompletion
- Gateway provider parsing extracts actual provider and model name
- Streaming metrics: `msToFirstChunk`, `msToFinish`, `tokensPerSecond`
- Cache tokens (`cacheReadTokens`, `cacheWriteTokens`) and reasoning tokens tracked
- Error capture from failed model calls and stream error chunks
- `captureEmbed()` for embedding calls (`embed`, `embedMany`)
- `ai` is an optional peer dependency
