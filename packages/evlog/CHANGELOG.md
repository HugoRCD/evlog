# evlog

## 2.13.0

### Minor Changes

- [#280](https://github.com/HugoRCD/evlog/pull/280) [`fa0ee26`](https://github.com/HugoRCD/evlog/commit/fa0ee267a10d65164b4aec6caa64208ce08af291) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Add `evlog/better-auth` integration for automatic user identification from [Better Auth](https://better-auth.com/) sessions.

  **New exports** (`evlog/better-auth`):
  - `identifyUser(log, session, options?)` — sets `userId`, `user`, and `session` fields on a wide event. Returns `true` if identified
  - `createAuthMiddleware(auth, options?)` — framework-agnostic `(log, headers, path?) => Promise<boolean>` with route filtering, timing capture, and lifecycle hooks
  - `createAuthIdentifier(auth, options?)` — Nitro `request` hook factory for standalone Nitro apps
  - `maskEmail(email)` — utility to mask emails for safe logging (`h***@example.com`)
  - `BetterAuthInstance` — reusable type for the auth parameter

  **Features:**
  - `include`/`exclude` route pattern filtering on `createAuthMiddleware`
  - `extend` callback for Better Auth plugin fields (organizations, roles, etc.)
  - `auth.resolvedIn` timing in every wide event
  - `auth.identified` boolean in every wide event
  - `session.userAgent` captured by default
  - `onIdentify`/`onAnonymous` lifecycle hooks
  - `console.warn` in development when session resolution fails

- [#284](https://github.com/HugoRCD/evlog/pull/284) [`861f6d2`](https://github.com/HugoRCD/evlog/commit/861f6d2c4e89ca99ef628484a68d69779acf4056) Thanks [@HugoRCD](https://github.com/HugoRCD)! - `log.set()` concatenates arrays when merging context for the same key. For example, `set({ items: [1, 2] })` followed by `set({ items: [3] })` yields `{ items: [1, 2, 3] }` instead of replacing with `[3]`. Plain objects are still deep-merged recursively; if either the existing or incoming value is not an array, the new value replaces the old one.

  **Breaking change:** Call sites that relied on the last `set` overwriting an array now accumulate elements. To replace a value at emit time, use `emit({ ... })` overrides or a different field name.

## 2.12.0

### Minor Changes

- [#272](https://github.com/HugoRCD/evlog/pull/272) [`2b5c8a4`](https://github.com/HugoRCD/evlog/commit/2b5c8a44de2aaeb38b3c9dbb5883e90f88b607b7) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Add AI SDK telemetry integration (`createEvlogIntegration`), cost estimation, and enriched embedding capture. `createEvlogIntegration()` implements the AI SDK's `TelemetryIntegration` interface to capture per-tool execution timing/success/errors and total generation wall time. Cost estimation computes `ai.estimatedCost` from a user-provided pricing map. `captureEmbed` now accepts model ID, dimensions, and batch count for richer embedding observability.

- [#271](https://github.com/HugoRCD/evlog/pull/271) [`583fab4`](https://github.com/HugoRCD/evlog/commit/583fab4ccd739bb735ad8e816d3bb397f6d08144) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Add auto-redaction (PII protection) with smart partial masking, enabled by default in production (`NODE_ENV === 'production'`). Built-in patterns (credit card, email, IPv4, phone, JWT, Bearer, IBAN) use context-preserving masks (e.g. `****1111`, `a***@***.com`) instead of flat `[REDACTED]`. Disabled in development for full debugging visibility. Fine-tune with `paths`, `patterns`, and `builtins`, or opt out with `redact: false`. Custom patterns use the configurable `replacement` string. Redaction runs before console output and before any drain sees the data.

- [#269](https://github.com/HugoRCD/evlog/pull/269) [`037dc81`](https://github.com/HugoRCD/evlog/commit/037dc8115001de081c0b524320cafc414346c25c) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Add `evlog/http` as the canonical HTTP ingest drain (`createHttpDrain`, `createHttpLogDrain`, `HttpDrainConfig`). Deprecate `evlog/browser`; it re-exports the same API and will be removed in the next **major** release.

- [#266](https://github.com/HugoRCD/evlog/pull/266) [`3898a3f`](https://github.com/HugoRCD/evlog/commit/3898a3f0972d21e21cded7dcdcb33e47869002cd) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Add `minLevel` for a deterministic severity threshold on the global `log` API and client `initLog`, plus `setMinLevel()` for runtime toggling in the browser. Orthogonal to probabilistic `sampling.rates`; request wide events from `useLogger` / `createLogger().emit()` are unchanged. Includes `isLevelEnabled()` helper and wiring for Nuxt, Vite, and Next.js.

  **2026-04-11** — Playground: interactive panel to try client `minLevel` / `setMinLevel` and trigger logs per level.

### Patch Changes

- [#270](https://github.com/HugoRCD/evlog/pull/270) [`79cb4a4`](https://github.com/HugoRCD/evlog/commit/79cb4a4e6a9300df2758f62ad1dda4794f9b4f05) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Add an [AWS Lambda](https://www.evlog.dev/frameworks/aws-lambda) guide to the documentation site (`initLogger` once, `createLogger` per invocation, manual `emit`).

## 2.11.1

### Patch Changes

- [#261](https://github.com/HugoRCD/evlog/pull/261) [`08cab7b`](https://github.com/HugoRCD/evlog/commit/08cab7b8e3e7d9e8179cf7add784349acd3632ea) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Fix Nuxt `evlog` options not reaching the Nitro plugin in dev: the Nuxt module now mirrors standalone Nitro by setting `process.env.__EVLOG_CONFIG` during `nitro:config`. When `enabled` is `false`, the Nitro plugins still attach a no-op request logger so `useLogger(event)` does not throw.

## 2.11.0

### Minor Changes

- [#249](https://github.com/HugoRCD/evlog/pull/249) [`72d7d6e`](https://github.com/HugoRCD/evlog/commit/72d7d6e57c9341fb2a1df78c3f80588ca50b08f5) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Add `internal` to `createError` / `ErrorOptions`: backend-only context stored on `EvlogError`, included in wide events via `log.error()`, never serialized in HTTP responses or `toJSON()` ([EVL-140](https://linear.app/evlog/issue/EVL-140)).

- [#251](https://github.com/HugoRCD/evlog/pull/251) [`19ae4a9`](https://github.com/HugoRCD/evlog/commit/19ae4a98e0da89c4b1ea0e00f32e238927da1fbb) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Add Datadog Logs HTTP drain adapter (`evlog/datadog`): `createDatadogDrain()`, `sendToDatadog` / `sendBatchToDatadog`, env vars `DD_API_KEY` / `NUXT_DATADOG_*` / `DD_SITE`, and intake URL for all Datadog sites. Maps wide events with a short `message` line, full payload under `evlog`, severity `status`, and recursive `httpStatusCode` renaming so HTTP `status` fields never clash with Datadog’s reserved severity ([EVL-144](https://linear.app/evlog/issue/EVL-144)).

### Patch Changes

- [#245](https://github.com/HugoRCD/evlog/pull/245) [`c96967b`](https://github.com/HugoRCD/evlog/commit/c96967bdff5b4e5d423f59cea436cd57cb281b57) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Fix Nitro server builds on strict Worker presets (e.g. `cloudflare-durable`) by avoiding Rollup-resolvable literals for `nitro/runtime-config` in published dist. Centralize runtime config access in an internal bridge (`__EVLOG_CONFIG` first, then dynamic `import()` with computed module specifiers for Nitro v3 and nitropack). Add regression tests for dist output and a `cloudflare-durable` production build using the compiled plugin.

- [#242](https://github.com/HugoRCD/evlog/pull/242) [`24c9a80`](https://github.com/HugoRCD/evlog/commit/24c9a80289561584f6b302a5e1b5419b8aac7401) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Export `createError`, `createEvlogError`, `EvlogError`, and `parseError` from `evlog/nitro/v3` so Nitro v3 apps can use the documented single import path alongside `useLogger` ([#241](https://github.com/HugoRCD/evlog/issues/241)).

- [#247](https://github.com/HugoRCD/evlog/pull/247) [`730c984`](https://github.com/HugoRCD/evlog/commit/730c984c16bf1543da6525caa6aa5ca788f64306) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Align `evlogErrorHandler` with TanStack Start’s `createMiddleware().server()` types: widen `next()` to sync-or-async results, match `RequestServerFn` return typing via `RequestServerResult`, and declare an optional peer on `@tanstack/start-client-core` for accurate declarations ([#235](https://github.com/HugoRCD/evlog/issues/235), [EVL-142](https://linear.app/evlog/issue/EVL-142)).

## 2.10.0

### Minor Changes

- [#225](https://github.com/HugoRCD/evlog/pull/225) [`3d1dcd4`](https://github.com/HugoRCD/evlog/commit/3d1dcd4678da83c05e754623b7443426231565ab) Thanks [@izadoesdev](https://github.com/izadoesdev)! - Add HyperDX drain adapter (`evlog/hyperdx`) for OTLP/HTTP ingest, with defaults aligned to [HyperDX OpenTelemetry documentation](https://hyperdx.io/docs/install/opentelemetry) (`https://in-otel.hyperdx.io`, `authorization` header). Includes docs site and `review-logging-patterns` skill updates.

- [#232](https://github.com/HugoRCD/evlog/pull/232) [`767ba27`](https://github.com/HugoRCD/evlog/commit/767ba2702c5e8c254360c315c76491128bd54169) Thanks [@MrLightful](https://github.com/MrLightful)! - Add configurable `credentials` (`RequestCredentials`, default `same-origin`) for the client log transport and browser drain `fetch` calls. The Nuxt module forwards `transport.credentials` into `runtimeConfig.public.evlog` so client `initLog()` receives it.

### Patch Changes

- [#228](https://github.com/HugoRCD/evlog/pull/228) [`4385dbc`](https://github.com/HugoRCD/evlog/commit/4385dbc6551577388123b77bcfaf3d709897ee08) Thanks [@shubh73](https://github.com/shubh73)! - Resolve Nitro runtime config in drain adapters via dynamic `import()` (Cloudflare Workers and other runtimes without `require`). Cache Nitro module namespaces after first load to avoid repeated imports on every drain. Fix HyperDX drain to `await` `resolveAdapterConfig()` so env/runtime config is applied when using `createHyperDXDrain()` without inline overrides.

- [#188](https://github.com/HugoRCD/evlog/pull/188) [`e3ebe9f`](https://github.com/HugoRCD/evlog/commit/e3ebe9faeac8bce7091ba9a8d90b31e8d66e4f43) Thanks [@mnismt](https://github.com/mnismt)! - Add `defineNodeInstrumentation()` for Next.js root `instrumentation.ts`: gate on `NEXT_RUNTIME === 'nodejs'`, cache the dynamic `import()` of `lib/evlog` between `register` and `onRequestError`, and export `NextInstrumentationRequest` / `NextInstrumentationErrorContext` types.

## 2.9.0

### Minor Changes

- [#212](https://github.com/HugoRCD/evlog/pull/212) [`96c47cd`](https://github.com/HugoRCD/evlog/commit/96c47cd3adfbaf0e6c53db9be55b45f652dfbdb8) Thanks [@MrLightful](https://github.com/MrLightful)! - Add React Router middleware integration (`evlog/react-router`) with automatic wide-event logging, drain, enrich, and tail sampling support

### Patch Changes

- [#220](https://github.com/HugoRCD/evlog/pull/220) [`b0c26d5`](https://github.com/HugoRCD/evlog/commit/b0c26d5eacb2382402a0ab99744650796ea52be7) Thanks [@HugoRCD](https://github.com/HugoRCD)! - fix(nitro): make `evlogErrorHandler` compatible with TanStack Start's `createMiddleware().server()` API

  `evlogErrorHandler` now accepts both `(next)` and `({ next })` signatures, so `createMiddleware().server(evlogErrorHandler)` works directly without a wrapper in all TanStack Start versions.

- [#215](https://github.com/HugoRCD/evlog/pull/215) [`31cb4ab`](https://github.com/HugoRCD/evlog/commit/31cb4ab903c969107a368cb5a9629eff6fe0c63b) Thanks [@HugoRCD](https://github.com/HugoRCD)! - fix(nitro): always create logger in request hook so `useLogger()` works in server middleware

  Previously, calling `useLogger(event)` inside a Nuxt server middleware would throw `"Logger not initialized"` because the Nitro plugin skipped logger creation for routes not matching `include` patterns. Since middleware runs for every request, this made it impossible to use `useLogger` there.

  The `shouldLog` filtering is now evaluated at emit time instead of creation time — the logger is always available on `event.context.log`, but events for non-matching routes are silently discarded.

- [#218](https://github.com/HugoRCD/evlog/pull/218) [`453a548`](https://github.com/HugoRCD/evlog/commit/453a5483d1a7b2db7979edbc306cd9b9584e9f40) Thanks [@benhid](https://github.com/benhid)! - fix(parseError): respect `.status` / `.statusCode` on Error instances instead of hardcoding 500

  Frameworks like NestJS attach HTTP status directly on Error subclasses (e.g. `BadRequestException` has `.status = 400`). Previously, `parseError()` ignored these properties and always returned 500 for any `Error` instance without a `data` property. Now uses `extractErrorStatus()` to extract the correct status.

- [#219](https://github.com/HugoRCD/evlog/pull/219) [`79f811d`](https://github.com/HugoRCD/evlog/commit/79f811dab02717470ed5f178b5c944a395dc4025) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Improve TanStack Start documentation with route filtering, pipeline (batching & retry), tail sampling sections, Vite plugin callout, and TanStack Router vs TanStack Start disambiguation

## 2.8.0

### Minor Changes

- [#196](https://github.com/HugoRCD/evlog/pull/196) [`abda28c`](https://github.com/HugoRCD/evlog/commit/abda28cc00b6276a59c2cf9dcfca295f4d7b878c) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Add `evlog/ai` integration for AI SDK v6+ observability.
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

- [#189](https://github.com/HugoRCD/evlog/pull/189) [`d92fb46`](https://github.com/HugoRCD/evlog/commit/d92fb46b2d272dca0de73a0ffedda746304f57b6) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Add `evlog/vite` plugin for build-time DX enhancements in any Vite-based framework.
  - Zero-config auto-initialization via Vite `define` (no `initLogger()` needed)
  - Build-time `log.debug()` stripping in production builds (default)
  - Source location injection (`__source: 'file:line'`) for object-form log calls
  - Opt-in auto-imports for `log`, `createEvlogError`, `parseError`
  - Client-side logger injection via `transformIndexHtml`
  - New `evlog/client` public entrypoint
  - Nuxt module gains `strip` and `sourceLocation` options (no breaking changes)

### Patch Changes

- [#197](https://github.com/HugoRCD/evlog/pull/197) [`3601d30`](https://github.com/HugoRCD/evlog/commit/3601d303c122509a8f665f20e8275248e6e6e7f5) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Add retry with exponential backoff to all HTTP drain adapters and improve timeout error messages.
  - Transient failures (timeouts, network errors, 5xx) are retried up to 2 times with exponential backoff (200ms, 400ms)
  - `AbortError` timeout errors now display a clear message: `"Axiom request timed out after 5000ms"` instead of the cryptic `"DOMException [AbortError]: This operation was aborted"`
  - New `retries` option on all adapter configs (Axiom, OTLP, Sentry, PostHog, Better Stack)
  - 4xx client errors are never retried

## 2.7.0

### Minor Changes

- [#175](https://github.com/HugoRCD/evlog/pull/175) [`aa18840`](https://github.com/HugoRCD/evlog/commit/aa18840459b4adced2747f70ebe0fed394348195) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Add file system drain adapter (`evlog/fs`) to write wide events as NDJSON files to the local file system with date-based rotation, size-based rotation, automatic cleanup, and `.gitignore` generation

- [#174](https://github.com/HugoRCD/evlog/pull/174) [`a77a69a`](https://github.com/HugoRCD/evlog/commit/a77a69a11caf350e190d0e9eae743c904a86cf4c) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Add `silent` option to suppress console output while still passing events to drains, fix drain pipeline to prevent double-draining in framework integrations, and add central configuration reference page to docs

### Patch Changes

- [#178](https://github.com/HugoRCD/evlog/pull/178) [`2b26ed2`](https://github.com/HugoRCD/evlog/commit/2b26ed2682cd98b21a5a64a44e6f3337018bae3c) Thanks [@ruisaraiva19](https://github.com/ruisaraiva19)! - Use request `originalUrl` for correct path extraction in NestJS and Express integrations (`evlog/nestjs`, `evlog/express`)

- [#172](https://github.com/HugoRCD/evlog/pull/172) [`d87d1e0`](https://github.com/HugoRCD/evlog/commit/d87d1e03ae47b913338f6d73bd7ed874316e749b) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Remove `@sveltejs/kit` optional peer dependency that caused `ERESOLVE` failures in non-SvelteKit projects (e.g. Nuxt 4) due to transitive `vite@^8.0.0` requirement

## 2.6.0

### Minor Changes

- [#169](https://github.com/HugoRCD/evlog/pull/169) [`e38787f`](https://github.com/HugoRCD/evlog/commit/e38787f08ea63bbff4ba2fea10945b2f9af94ef5) Thanks [@OskarLebuda](https://github.com/OskarLebuda)! - Add `evlog/toolkit` entrypoint exposing building blocks for custom framework integrations (`createMiddlewareLogger`, `extractSafeHeaders`, `createLoggerStorage`, `extractErrorStatus`)

### Patch Changes

- [#164](https://github.com/HugoRCD/evlog/pull/164) [`d84b032`](https://github.com/HugoRCD/evlog/commit/d84b03277d20cce649e4711db2e6bedbafd3f0f4) Thanks [@oritwoen](https://github.com/oritwoen)! - Fix browser DevTools pretty printing to use CSS `%c` formatting instead of ANSI escape codes (fixes Firefox rendering), share CSS color constants between standalone and client loggers, and escape `%` in dynamic values to prevent format string injection

- [#166](https://github.com/HugoRCD/evlog/pull/166) [`5f45b3f`](https://github.com/HugoRCD/evlog/commit/5f45b3ff01d2f73dbd92de14e384608541002bd3) Thanks [@schplitt](https://github.com/schplitt)! - Fix Nitro v3 error handler registration and update to Nitro v3 beta

## 2.5.0

### Minor Changes

- [`d7b06fa`](https://github.com/HugoRCD/evlog/commit/d7b06faba5704aa97fe1b9a46628be974a1b8a37) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Add default condition to subpath exports for CJS compatibility and fix OTLP batch grouping by resource identity

## 2.4.1

### Patch Changes

- [`8ade245`](https://github.com/HugoRCD/evlog/commit/8ade2455ecc8f8da37e71fe19b7302dfb1563d69) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Restore useLogger() JSDoc for IntelliSense and remove unused RequestLogger import from Fastify adapter

## 2.4.0

### Minor Changes

- [#141](https://github.com/HugoRCD/evlog/pull/141) [`91f8ceb`](https://github.com/HugoRCD/evlog/commit/91f8cebe3d00efcd1b9fc8795b2b272a17b8258d) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Add NestJS integration (`evlog/nestjs`) with Express-compatible middleware, `useLogger()` via AsyncLocalStorage, and full pipeline support (drain, enrich, keep)

- [#142](https://github.com/HugoRCD/evlog/pull/142) [`866b286`](https://github.com/HugoRCD/evlog/commit/866b28687cd9cae2dfe347c5831a3c62648906ef) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Add SvelteKit integration (`evlog/sveltekit`) with handle hook, error handler, `useLogger()`, and `createEvlogHooks()` for automatic wide-event logging, drain, enrich, and tail sampling support

## 2.3.0

### Minor Changes

- [#135](https://github.com/HugoRCD/evlog/pull/135) [`e3e53a2`](https://github.com/HugoRCD/evlog/commit/e3e53a2dac958e0ede9dffb70623f90ff800c0bc) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Add Elysia plugin integration (`evlog/elysia`) with automatic wide-event logging, drain, enrich, and tail sampling support

## 2.2.0

### Minor Changes

- [#134](https://github.com/HugoRCD/evlog/pull/134) [`2f92513`](https://github.com/HugoRCD/evlog/commit/2f9251346384eef42cc209919ae367aee6054845) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Add Express middleware integration (`evlog/express`) with automatic wide-event logging, drain, enrich, and tail sampling support

- [#132](https://github.com/HugoRCD/evlog/pull/132) [`e8d68ac`](https://github.com/HugoRCD/evlog/commit/e8d68acf7e6ef44ad4ee44aff2decc4a4885d73f) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Add Hono middleware integration (`evlog/hono`) for automatic wide-event logging in Hono applications, with support for `drain`, `enrich`, and `keep` callbacks

## 2.1.0

### Minor Changes

- [`f6cba9b`](https://github.com/HugoRCD/evlog/commit/f6cba9b39a84e88ae44eef8ea167e6baa3a43e51) Thanks [@HugoRCD](https://github.com/HugoRCD)! - bump version
