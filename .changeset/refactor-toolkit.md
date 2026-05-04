---
"evlog": minor
---

Refactor core & toolkit into composable building blocks (EVL-155). The internal helpers that powered every built-in adapter, enricher, and framework integration are now public under `evlog/toolkit`, alongside three new factories and a canonical config entry point.

**This release is fully backwards-compatible.** Every previously-working snippet keeps working — adapter renames ship with deprecated aliases, the dual PostHog factory is kept as a thin wrapper, and the new toolkit primitives are additive. Nothing to migrate.

### What's new

- **`definePlugin()`** — single canonical extension contract. A plugin can opt into any subset of `setup`, `enrich`, `drain`, `keep`, `onRequestStart`, `onRequestFinish`, `onClientLog`, `extendLogger`. Drains and enrichers are now sugar over plugins (`drainPlugin`, `enricherPlugin`).
- **`defineHttpDrain()`** — adapter factory. Provide `resolve()` (config) and `encode()` (payload); retries, timeouts, batching, and error isolation are handled for you. All 8 built-in adapters (Axiom, OTLP, HyperDX, PostHog, Sentry, Better Stack, Datadog, FS) now use this internally.
- **`defineEnricher()`** — enricher factory. Provide `compute()`; merge, error isolation, and undefined skipping are handled for you. All 4 built-in enrichers (UserAgent, Geo, RequestSize, TraceContext) now use this internally.
- **`defineFrameworkIntegration()`** — manifest-mode framework integration. Provide `extractRequest`, `attachLogger`, and an optional `storage`; the helper handles header normalization, request-id generation, ALS, and `log.fork()` attachment. Hono, Express, Fastify, and Elysia now use this internally.
- **`defineEvlog()`** — canonical config object. One shape that works across `initLogger`, framework middlewares, the Nuxt module, and Workers via `toLoggerConfig` / `toMiddlewareOptions`.
- **Composers**: `composeEnrichers`, `composeDrains`, `composeKeep`, `composePlugins` for combining multiple extensions with built-in error isolation.
- **`evlog/toolkit`** is now the public entry point for all building blocks.
- **`createDefaultEnrichers()`** — shorthand for `composeEnrichers([userAgent, geo, requestSize, traceContext])`.

### Standardized naming (additive, with deprecated aliases)

We've standardized on `apiKey` for any bearer-style secret. The previous names continue to work and emit a one-time deprecation warning:

| Adapter | Recommended | Still works (deprecated) |
|---|---|---|
| Axiom | `apiKey` / `AXIOM_API_KEY` | `token` / `AXIOM_TOKEN` |
| Better Stack | `apiKey` / `BETTER_STACK_API_KEY` | `sourceToken` / `BETTER_STACK_SOURCE_TOKEN` |

Sentry keeps `dsn` (genuinely different format).

PostHog's two factories are unified — but the old name is still exported:

```ts
// Recommended
createPostHogDrain({ mode: 'events' })

// Still works (deprecated, re-routes to the line above)
createPostHogEventsDrain()
```

These deprecated aliases will be removed in the next **major** release.

### Adoption

Existing code keeps working. To opt into the new primitives:

```ts
import { defineEvlog, defineHttpDrain, definePlugin } from 'evlog/toolkit'
```

See [Toolkit Reference](https://evlog.dev/adapters/building-blocks/toolkit) for the complete public API.
