# evlog

A TypeScript logging library focused on **wide events** and structured error handling.

## Keeping This File Updated

This file is a living document. **Update it proactively** whenever you encounter any of the following:

- **Recurring mistake**: You made the same error twice, or you notice a pattern that's easy to get wrong (wrong import path, deprecated API, incorrect assumption) → add a note under the relevant section or a callout in Development Guidelines.
- **Explicit guidance from the maintainer**: The maintainer corrects your approach, tells you to always/never do something, or points out a structural rule → capture it here immediately so future sessions follow the same rule.
- **New pattern established**: A new convention is agreed on (file to update, naming rule, architecture decision) → document it so it's applied consistently going forward.
- **Full update / reset**: If the maintainer says something equivalent to "everything needs to be updated" or "go through all X and make sure they're consistent" → after completing the work, add a note here summarizing what was done and what invariant to maintain.

When updating this file, be specific and actionable. Prefer short targeted notes over long prose. Place notes near the relevant section they apply to.

Inspired by [Logging Sucks](https://loggingsucks.com/) by [Boris Tane](https://x.com/boristane).

## Philosophy

Traditional logging is broken. Your logs are scattered across dozens of files, each request generates 10+ log lines, and when something goes wrong, you're left grep-ing through noise hoping to find signal.

**evlog** takes a different approach:

1. **Wide Events**: One comprehensive log event per request, containing all context you need
2. **Structured Errors**: Errors that explain *why* they occurred and *how* to fix them
3. **Request Scoping**: Accumulate context throughout the request lifecycle, emit once at the end
4. **Pretty for Dev, JSON for Prod**: Human-readable in development, machine-parseable in production

## Quick Reference

| Command | Description |
|---------|-------------|
| `bun install` | Install dependencies |
| `bun run dev` | Start playground |
| `bun run dev:prepare` | Prepare module (generate types) |
| `bun run docs` | Start documentation site |
| `bun run build:package` | Build the package |
| `bun run test` | Run tests |
| `bun run lint` | Lint all packages |
| `bun run typecheck` | Type check all packages |

## Monorepo Structure

```
evlog/
├── apps/
│   ├── playground/          # Dev environment for testing
│   └── docs/                # Docus documentation site
├── packages/
│   └── evlog/               # Main package
│       ├── src/
│       │   ├── nuxt/        # Nuxt module
│       │   ├── nitro/       # Nitro plugin
│       │   ├── vite/        # Vite plugin (evlog/vite)
│       │   ├── shared/      # Toolkit: building blocks for custom framework integrations (evlog/toolkit)
│       │   ├── ai/          # AI SDK integration (evlog/ai)
│       │   ├── adapters/    # Log drain adapters (Axiom, OTLP, HyperDX, PostHog, Sentry, Better Stack, Datadog)
│       │   ├── enrichers/   # Built-in enrichers (UserAgent, Geo, RequestSize, TraceContext)
│       │   └── runtime/     # Runtime code (client/, server/, utils/)
│       └── test/            # Tests
└── .github/                  # CI/CD workflows
```

## Core API

### Nuxt/Nitro API Routes

Use `useLogger(event)` in any API route. The logger is auto-created and auto-emitted at request end.

```typescript
// server/api/checkout.post.ts
export default defineEventHandler(async (event) => {
  const log = useLogger(event)

  log.set({ user: { id: user.id, plan: user.plan } })
  log.set({ cart: { items: 3, total: 9999 } })

  // On success: emits INFO level wide event automatically
  return { success: true }
})
```

### Standalone TypeScript (scripts, workers, CLI)

Use `initLogger()` once at startup, then `createLogger()` for each logical operation.

```typescript
// scripts/sync-job.ts
import { initLogger, createLogger } from 'evlog'

initLogger({
 env: { service: 'sync-worker', environment: 'production' },
})

const log = createLogger({ jobId: job.id, source: job.source, target: job.target })
log.set({ recordsSynced: 150 })
log.emit() // Manual emit required
```

For HTTP request contexts specifically, use `createRequestLogger()` which pre-populates `method`, `path`, and `requestId`:

```typescript
import { createRequestLogger } from 'evlog'

const log = createRequestLogger({ method: 'POST', path: '/api/checkout' })
```

### Simple Logging (anywhere)

Use `log` for quick one-off logs. Auto-imported in Nuxt, manual import elsewhere.

```typescript
import { log } from 'evlog'

log.info('auth', 'User logged in')
log.error({ action: 'payment', error: 'card_declined' })
```

### AI SDK Integration

Use `createAILogger(log)` to capture AI SDK data (token usage, tool calls, model info, streaming metrics) into wide events. Works via model middleware — no callback conflicts.

```typescript
// server/api/chat.post.ts
import { streamText } from 'ai'
import { createAILogger } from 'evlog/ai'

export default defineEventHandler(async (event) => {
 const log = useLogger(event)
 const ai = createAILogger(log)

 const result = streamText({
 model: ai.wrap('anthropic/claude-sonnet-4.6'),
 messages,
 onFinish: ({ text }) => saveConversation(text), // no conflict
 })

 return result.toTextStreamResponse()
})
```

For embedding calls, use `captureEmbed`:

```typescript
const { embedding, usage } = await embed({ model: embeddingModel, value: query })
ai.captureEmbed({ usage })
```

### Structured Errors

Use `createError()` to throw errors with context. Works with Nitro's error handling.

```typescript
// server/api/checkout.post.ts
import { createError } from 'evlog'

throw createError({
  message: 'Payment failed',
  status: 402,
  why: 'Card declined by issuer',
  fix: 'Try a different payment method',
  link: 'https://docs.example.com/payments/declined',
})
```

**Nitro Compatibility**: When thrown in a Nuxt/Nitro API route, the error is automatically converted to an HTTP response with:
- `statusCode` from the `status` field
- `message` as the error message
- `data` containing `{ why, fix, link }` for frontend consumption

**Frontend Integration**: Use `parseError()` to extract all fields at the top level:

```typescript
import { parseError } from 'evlog'

try {
  await $fetch('/api/checkout')
} catch (err) {
  const error = parseError(err)

  // Direct access to all fields
  toast.add({
    title: error.message,
    description: error.why,
    color: 'error',
    actions: error.link ? [{ label: 'Learn more', onClick: () => window.open(error.link) }] : undefined,
  })

  if (error.fix) console.info(`💡 Fix: ${error.fix}`)
}
```

## Vite Plugin

The `evlog/vite` plugin provides build-time DX for any Vite-based framework (SvelteKit, Astro, SolidStart, React+Vite, etc.). It complements runtime framework integrations — it does NOT replace them.

```typescript
// vite.config.ts
import evlog from 'evlog/vite'

export default defineConfig({
  plugins: [
    evlog({
      service: 'my-app',
      sampling: { rates: { info: 10, debug: 0 } },
      autoImports: true,
      strip: ['debug'],
      sourceLocation: true,
      client: { transport: { endpoint: '/api/logs' } },
    }),
  ],
})
```

### Features

| Feature | Option | Description |
|---------|--------|-------------|
| Auto-init | `service` | Injects `__EVLOG_CONFIG__` via Vite `define` — `initLogger()` is called automatically at import time |
| Auto-imports | `autoImports: true` | Auto-import `log`, `createEvlogError`, `parseError` with `.d.ts` generation |
| Client init | `client: {...}` | Inject `initLog()` via `transformIndexHtml` for client-side logging |
| Log stripping | `strip: ['debug']` | Remove `log.debug()` calls from production builds via AST transform |
| Source location | `sourceLocation: true` | Inject `__source: 'file:line'` into `log.*()` object-form calls |

### Architecture

- Source lives in `packages/evlog/src/vite/`
- Each feature is a separate Vite plugin returned as an array
- Individual plugins (`createStripPlugin`, `createSourceLocationPlugin`) can be used standalone (e.g., from the Nuxt module via `addVitePlugin()`)
- Transform functions use Rollup's built-in acorn parser (`this.parse()`) + MagicString (inlined at build time via tsdown)
- `evlog/client` is a public re-export of `runtime/client/log.ts` for client-side init

### Nuxt module integration

The Nuxt module uses `addVitePlugin()` to add strip + source location plugins internally. Auto-imports and client init are NOT delegated (Nuxt handles those natively). This is purely additive — no breaking change.

On `nitro:config`, the module serializes `runtimeConfig.evlog` into **`process.env.__EVLOG_CONFIG`** (same bridge as standalone Nitro). The Nitro plugin resolves config with **env first**, then `useRuntimeConfig().evlog`. That env injection is required because dev workers often cannot resolve the virtual Nitro runtime-config module reliably. **Do not** set `__EVLOG_CONFIG` yourself in a Nuxt app unless you mean to override the entire `evlog` block from `nuxt.config`.

## Framework Integration

> **Creating a new framework integration?** Follow the skill at `.agents/skills/create-framework-integration/SKILL.md`. It covers all touchpoints: source code, build config, package exports, tests, example app, and all documentation updates.

### Nuxt

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['evlog/nuxt'],
  evlog: {
    env: {
      service: 'my-app',
    },
    // Optional: only log specific routes (supports glob patterns)
    include: ['/api/**'],
  },
})
```

#### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Globally enable/disable all logging. When `false`, all operations become no-ops |
| `console` | `boolean` | `true` | Enable/disable browser console output. When `false`, client logs are suppressed in DevTools but still sent via transport |
| `env.service` | `string` | `'app'` | Service name shown in logs |
| `env.environment` | `string` | Auto-detected | Environment name |
| `include` | `string[]` | `undefined` | Route patterns to log (glob). If not set, all routes are logged |
| `pretty` | `boolean` | `true` in dev | Pretty print logs with tree formatting |
| `silent` | `boolean` | `false` | Suppress console output. Events are still built, sampled, and drained. Use for stdout-based platforms (GCP Cloud Run, AWS Lambda) |
| `sampling.rates` | `object` | `undefined` | Head sampling rates per log level (0-100%). Error defaults to 100% |
| `sampling.keep` | `array` | `undefined` | Tail sampling conditions to force-keep logs (see below) |
| `transport.enabled` | `boolean` | `false` | Enable sending client logs to the server |
| `transport.endpoint` | `string` | `'/api/_evlog/ingest'` | API endpoint for client log ingestion |

#### Sampling Configuration

evlog supports two sampling strategies:

**Head Sampling (rates)**: Random sampling based on log level, decided before request completes.

**Tail Sampling (keep)**: Force-keep logs based on request outcome, evaluated after request completes.

```typescript
export default defineNuxtConfig({
  modules: ['evlog/nuxt'],
  evlog: {
    sampling: {
      // Head sampling: random percentage per level
      rates: { info: 10, warn: 50, debug: 0 },
      // Tail sampling: force keep based on outcome (OR logic)
      keep: [
        { duration: 1000 },           // Keep if duration >= 1000ms
        { status: 400 },              // Keep if status >= 400
        { path: '/api/critical/**' }, // Keep if path matches
      ],
    },
  },
})
```

**Custom Tail Sampling Hook**: For business-specific conditions, use the `evlog:emit:keep` Nitro hook:

```typescript
// server/plugins/evlog-custom.ts
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:emit:keep', (ctx) => {
    if (ctx.context.user?.premium) {
      ctx.shouldKeep = true
    }
  })
})
```

#### Log Draining & Adapters

evlog provides built-in adapters for popular observability platforms. Use the `evlog:drain` hook to send logs to external services.

> **Creating a new adapter?** Follow the skill at `.agents/skills/create-adapter/SKILL.md`. It covers all touchpoints: source code, build config, package exports, tests, and all documentation updates.

**Built-in Adapters:**

| Adapter | Import | Description |
|---------|--------|-------------|
| Axiom | `evlog/axiom` | Send logs to Axiom for querying and dashboards |
| OTLP | `evlog/otlp` | OpenTelemetry Protocol for Grafana, Datadog, Honeycomb, etc. |
| HyperDX | `evlog/hyperdx` | Send logs to HyperDX via OTLP/HTTP ([documented](https://hyperdx.io/docs/install/opentelemetry) endpoint and `authorization` header) |
| PostHog | `evlog/posthog` | Send logs to PostHog Logs via OTLP for structured logging and observability |
| Sentry | `evlog/sentry` | Send logs to Sentry Logs for structured logging and debugging |
| Better Stack | `evlog/better-stack` | Send logs to Better Stack for log management and alerting |
| Datadog | `evlog/datadog` | Send logs to Datadog Logs via the HTTP intake API (`DD-API-KEY`) |

**Using Axiom Adapter:**

```typescript
// server/plugins/evlog-drain.ts
import { createAxiomDrain } from 'evlog/axiom'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:drain', createAxiomDrain())
})
```

Set environment variables: `NUXT_AXIOM_TOKEN` and `NUXT_AXIOM_DATASET`.

**Using OTLP Adapter:**

```typescript
// server/plugins/evlog-drain.ts
import { createOTLPDrain } from 'evlog/otlp'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:drain', createOTLPDrain())
})
```

Set environment variable: `NUXT_OTLP_ENDPOINT`.

**Using HyperDX Adapter:**

```typescript
// server/plugins/evlog-drain.ts
import { createHyperDXDrain } from 'evlog/hyperdx'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:drain', createHyperDXDrain())
})
```

Set environment variable: `NUXT_HYPERDX_API_KEY` or `HYPERDX_API_KEY` (see [HyperDX OpenTelemetry](https://hyperdx.io/docs/install/opentelemetry)).

**Using PostHog Adapter:**

```typescript
// server/plugins/evlog-drain.ts
import { createPostHogDrain } from 'evlog/posthog'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:drain', createPostHogDrain())
})
```

Set environment variable: `NUXT_POSTHOG_API_KEY` (and optionally `NUXT_POSTHOG_HOST` for EU or self-hosted instances).

**Using Sentry Adapter:**

```typescript
// server/plugins/evlog-drain.ts
import { createSentryDrain } from 'evlog/sentry'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:drain', createSentryDrain())
})
```

Set environment variable: `NUXT_SENTRY_DSN`.

**Using Better Stack Adapter:**

```typescript
// server/plugins/evlog-drain.ts
import { createBetterStackDrain } from 'evlog/better-stack'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:drain', createBetterStackDrain())
})
```

Set environment variable: `NUXT_BETTER_STACK_SOURCE_TOKEN`.

**Using Datadog Adapter:**

```typescript
// server/plugins/evlog-drain.ts
import { createDatadogDrain } from 'evlog/datadog'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:drain', createDatadogDrain())
})
```

Set environment variables: `NUXT_DATADOG_API_KEY` or `DD_API_KEY`, and optionally `DD_SITE` (e.g. `datadoghq.eu`).

**Multiple Destinations:**

```typescript
// server/plugins/evlog-drain.ts
import { createAxiomDrain } from 'evlog/axiom'
import { createOTLPDrain } from 'evlog/otlp'

export default defineNitroPlugin((nitroApp) => {
  const axiom = createAxiomDrain()
  const otlp = createOTLPDrain()

  nitroApp.hooks.hook('evlog:drain', async (ctx) => {
    await Promise.allSettled([axiom(ctx), otlp(ctx)])
  })
})
```

**Custom Adapter:**

```typescript
// server/plugins/evlog-drain.ts
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:drain', async (ctx) => {
    await fetch('https://your-service.com/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ctx.event),
    })
  })
})
```

The `DrainContext` contains:
- `event`: The complete `WideEvent` with all fields (timestamp, level, service, etc.)
- `request`: Optional request metadata (`method`, `path`, `requestId`)
- `headers`: Safe HTTP headers (sensitive headers are filtered)

**Tip:** Use `$production` to sample only in production:

```typescript
export default defineNuxtConfig({
  modules: ['evlog/nuxt'],
  evlog: { env: { service: 'my-app' } },
  $production: {
    evlog: {
      sampling: {
        rates: { info: 10, warn: 50, debug: 0 },
        keep: [{ duration: 1000 }, { status: 400 }],
      },
    },
  },
})
```

#### Event Enrichment

Enrichers add derived context to wide events after emit, before drain. Use the `evlog:enrich` hook to register enrichers.

> **Creating a new enricher?** Follow the skill at `.agents/skills/create-enricher/SKILL.md`. It covers all touchpoints: source code, tests, and documentation updates.

**Built-in Enrichers:**

| Enricher | Import | Event Field | Description |
|----------|--------|-------------|-------------|
| User Agent | `evlog/enrichers` | `userAgent` | Parse browser, OS, device type from User-Agent header |
| Geo | `evlog/enrichers` | `geo` | Extract country, region, city from platform headers (Vercel, Cloudflare) |
| Request Size | `evlog/enrichers` | `requestSize` | Capture request/response payload sizes from Content-Length |
| Trace Context | `evlog/enrichers` | `traceContext` | Extract W3C trace context (traceId, spanId) from traceparent header |

**Using Built-in Enrichers:**

```typescript
// server/plugins/evlog-enrich.ts
import {
  createUserAgentEnricher,
  createGeoEnricher,
  createRequestSizeEnricher,
  createTraceContextEnricher,
} from 'evlog/enrichers'

export default defineNitroPlugin((nitroApp) => {
  const enrichers = [
    createUserAgentEnricher(),
    createGeoEnricher(),
    createRequestSizeEnricher(),
    createTraceContextEnricher(),
  ]

  nitroApp.hooks.hook('evlog:enrich', (ctx) => {
    for (const enricher of enrichers) enricher(ctx)
  })
})
```

**Custom Enricher:**

```typescript
// server/plugins/evlog-enrich.ts
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:enrich', (ctx) => {
    ctx.event.deploymentId = process.env.DEPLOYMENT_ID
    ctx.event.region = process.env.FLY_REGION
  })
})
```

The `EnrichContext` contains:
- `event`: The emitted `WideEvent` (mutable — add or modify fields directly)
- `request`: Optional request metadata (`method`, `path`, `requestId`)
- `headers`: Safe HTTP headers (sensitive headers are filtered)
- `response`: Optional response metadata (`status`, `headers`)

All enrichers accept `{ overwrite?: boolean }` — defaults to `false` to preserve user-provided data.

### Nitro v3

```typescript
// nitro.config.ts
import { defineConfig } from 'nitro'
import evlog from 'evlog/nitro/v3'

export default defineConfig({
  modules: [
    evlog({ env: { service: 'my-api' } })
  ],
})
```

Import `useLogger` from `evlog/nitro/v3` in routes:

```typescript
import { defineHandler } from 'nitro/h3'
import { useLogger } from 'evlog/nitro/v3'
import { createError } from 'evlog'
```

### TanStack Start

TanStack Start uses Nitro v3 under the hood. Install evlog and add a `nitro.config.ts`:

```typescript
// nitro.config.ts
import { defineConfig } from 'nitro'
import evlog from 'evlog/nitro/v3'

export default defineConfig({
  experimental: { asyncContext: true },
  modules: [
    evlog({ env: { service: 'my-app' } })
  ],
})
```

Add the error handling middleware to your root route so `throw createError()` returns structured JSON:

```typescript
// src/routes/__root.tsx
import { createRootRoute } from '@tanstack/react-router'
import { createMiddleware } from '@tanstack/react-start'
import { evlogErrorHandler } from 'evlog/nitro/v3'

export const Route = createRootRoute({
  server: {
    middleware: [createMiddleware().server(evlogErrorHandler)],
  },
})
```

For TypeScript, `evlog` declares an optional peer on `@tanstack/start-client-core` so `evlogErrorHandler` is typed as TanStack’s `RequestServerFn`. Apps using `@tanstack/react-start` already pull that package in for type resolution.

Use `useRequest()` from `nitro/context` to access the logger in routes:

```typescript
import { createFileRoute } from '@tanstack/react-router'
import { useRequest } from 'nitro/context'
import { createError } from 'evlog'
import type { RequestLogger } from 'evlog'

export const Route = createFileRoute('/api/checkout')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const req = useRequest()
        const log = req.context.log as RequestLogger
        const body = await request.json()

        log.set({ user: { id: body.userId } })

        throw createError({
          message: 'Payment failed',
          status: 402,
          why: 'Card declined by issuer',
          fix: 'Try a different payment method',
        })
      },
    },
  },
})
```

### Hono

```typescript
import { Hono } from 'hono'
import { initLogger } from 'evlog'
import { evlog, type EvlogVariables } from 'evlog/hono'

initLogger({ env: { service: 'my-api' } })

const app = new Hono<EvlogVariables>()
app.use(evlog())

app.get('/api/users', (c) => {
  const log = c.get('log')
  log.set({ users: { count: 42 } })
  return c.json({ users: [] })
})
```

The middleware supports the full evlog pipeline — `drain`, `enrich`, and `keep` callbacks — ensuring feature parity with Nuxt and Next.js:

```typescript
import { createAxiomDrain } from 'evlog/axiom'

app.use(evlog({
  include: ['/api/**'],
  drain: createAxiomDrain(),
  enrich: (ctx) => { ctx.event.region = process.env.FLY_REGION },
  keep: (ctx) => {
    if (ctx.duration && ctx.duration > 2000) ctx.shouldKeep = true
  },
}))
```

### Express

```typescript
import express from 'express'
import { initLogger } from 'evlog'
import { evlog, useLogger } from 'evlog/express'

initLogger({ env: { service: 'my-api' } })

const app = express()
app.use(evlog())

app.get('/api/users', (req, res) => {
  req.log.set({ users: { count: 42 } })
  res.json({ users: [] })
})
```

Use `useLogger()` to access the logger from anywhere in the call stack without passing `req`:

```typescript
import { useLogger } from 'evlog/express'

function findUsers() {
  const log = useLogger()
  log.set({ db: { query: 'SELECT * FROM users' } })
}
```

The middleware supports the full evlog pipeline — `drain`, `enrich`, and `keep` callbacks:

```typescript
import { createAxiomDrain } from 'evlog/axiom'

app.use(evlog({
  include: ['/api/**'],
  drain: createAxiomDrain(),
  enrich: (ctx) => { ctx.event.region = process.env.FLY_REGION },
  keep: (ctx) => {
    if (ctx.duration && ctx.duration > 2000) ctx.shouldKeep = true
  },
}))
```

### Elysia

```typescript
import { Elysia } from 'elysia'
import { initLogger } from 'evlog'
import { evlog, useLogger } from 'evlog/elysia'

initLogger({ env: { service: 'my-api' } })

const app = new Elysia()
  .use(evlog())
  .get('/api/users', ({ log }) => {
    log.set({ users: { count: 42 } })
    return { users: [] }
  })
  .listen(3000)
```

Use `useLogger()` to access the logger from anywhere in the call stack:

```typescript
import { useLogger } from 'evlog/elysia'

function findUsers() {
  const log = useLogger()
  log.set({ db: { query: 'SELECT * FROM users' } })
}
```

The plugin supports the full evlog pipeline — `drain`, `enrich`, and `keep` callbacks:

```typescript
import { createAxiomDrain } from 'evlog/axiom'

app.use(evlog({
  include: ['/api/**'],
  drain: createAxiomDrain(),
  enrich: (ctx) => { ctx.event.region = process.env.FLY_REGION },
  keep: (ctx) => {
    if (ctx.duration && ctx.duration > 2000) ctx.shouldKeep = true
  },
}))
```

### Fastify

```typescript
import Fastify from 'fastify'
import { initLogger } from 'evlog'
import { evlog, useLogger } from 'evlog/fastify'

initLogger({ env: { service: 'my-api' } })

const app = Fastify()
await app.register(evlog)

app.get('/api/users', async (request) => {
  request.log.set({ users: { count: 42 } })
  return { users: [] }
})
```

Use `useLogger()` to access the logger from anywhere in the call stack:

```typescript
import { useLogger } from 'evlog/fastify'

function findUsers() {
  const log = useLogger()
  log.set({ db: { query: 'SELECT * FROM users' } })
}
```

The plugin supports the full evlog pipeline — `drain`, `enrich`, and `keep` callbacks:

```typescript
import { createAxiomDrain } from 'evlog/axiom'

await app.register(evlog, {
  include: ['/api/**'],
  drain: createAxiomDrain(),
  enrich: (ctx) => { ctx.event.region = process.env.FLY_REGION },
  keep: (ctx) => {
    if (ctx.duration && ctx.duration > 2000) ctx.shouldKeep = true
  },
})
```

**Key Fastify specifics:**
- `request.log` is the evlog wide-event logger (shadows Fastify's built-in pino logger on the request; plugin encapsulation is broken via `Symbol.for('skip-override')`, no extra dependency)
- Fastify's built-in pino logger stays available via `fastify.log` — evlog complements it for wide events
- Lifecycle: `onRequest` creates the logger → `onResponse` emits with status → `onError` captures errors and prevents double emit
- `useLogger()` uses `AsyncLocalStorage` propagated via `storage.run(logger, () => done())` in `onRequest`

### NestJS

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common'
import { EvlogModule } from 'evlog/nestjs'

@Module({
  imports: [EvlogModule.forRoot()],
})
export class AppModule {}
```

`EvlogModule.forRoot()` registers a global middleware. Use `useLogger()` to access the request-scoped logger from any controller or service:

```typescript
import { useLogger } from 'evlog/nestjs'

function findUsers() {
  const log = useLogger()
  log.set({ db: { query: 'SELECT * FROM users' } })
}
```

The module supports the full evlog pipeline — `drain`, `enrich`, and `keep` callbacks:

```typescript
import { createAxiomDrain } from 'evlog/axiom'

EvlogModule.forRoot({
  include: ['/api/**'],
  drain: createAxiomDrain(),
  enrich: (ctx) => { ctx.event.region = process.env.FLY_REGION },
  keep: (ctx) => {
    if (ctx.duration && ctx.duration > 2000) ctx.shouldKeep = true
  },
})
```

For async configuration, use `forRootAsync()` with NestJS dependency injection:

```typescript
EvlogModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config) => ({
    drain: createAxiomDrain({ token: config.get('AXIOM_TOKEN') }),
  }),
})
```

### Nitro v2

```typescript
// nitro.config.ts
import { defineNitroConfig } from 'nitropack/config'
import evlog from 'evlog/nitro'

export default defineNitroConfig({
  modules: [
    evlog({ env: { service: 'my-api' } })
  ],
})
```

Import `useLogger` from `evlog/nitro` in routes:

```typescript
import { defineEventHandler } from 'h3'
import { useLogger } from 'evlog/nitro'
import { createError } from 'evlog'
```

## Documentation Invariants

Rules established through past work — maintain these actively.

### User-facing framework docs live in the skill, not here

`skills/review-logging-patterns/SKILL.md` is the source of truth for user-facing documentation (framework setup, adapters, enrichers). **When a new framework/adapter/enricher is added, update `skills/review-logging-patterns/SKILL.md` first** — not this file.

This file retains framework sections as development context (useful for understanding the codebase), but the internal skills (`.agents/skills/`) mandate updating the public skill, not this file.

### Hono does not export `useLogger()`

`evlog/hono` only exposes `evlog` and `EvlogVariables`. Logger access is via `c.get('log')` in handlers. Do **not** import or document `useLogger` for Hono — it doesn't exist. The other frameworks (Express, Fastify, Elysia) do export `useLogger()`.

### `evlog/toolkit` is the public entrypoint for `src/shared/`

The `src/shared/` directory is exposed as `evlog/toolkit` (not `evlog/shared`). The directory stays named `shared/` internally, but the public entrypoint is `toolkit`. All framework integrations import from `../shared/*` internally. `extractErrorStatus` lives in `shared/errors.ts` (re-exported from `nitro.ts` for backward compatibility). The toolkit API is marked `@beta`.

### README.md is a symlink

`README.md` at the repo root is a symlink to `packages/evlog/README.md`. Edit the source (`packages/evlog/README.md`) directly — it's the same file.

### `evlog/http` vs `evlog/browser` vs `evlog/client`

- **`evlog/http`** — HTTP ingest drain (`createHttpDrain`, `createHttpLogDrain`). Prefer this for batched transport to a server endpoint.
- **`evlog/browser`** — Deprecated re-export of `evlog/http` (same API). **Will be removed in the next major release.** Document migrations toward `evlog/http`.
- **`evlog/client`** — Client-side `log` / `initLog` runtime (not a drain transport).

## Development Guidelines

### Wide Event Fields

Every wide event should include:

- **Request context**: `method`, `path`, `requestId`, `traceId`
- **User context**: `userId`, `subscription`, `accountAge`
- **Business context**: Domain-specific data (cart, order, etc.)
- **Outcome**: `status`, `duration`, `error` (if any)

### Error Structure

When creating errors with `createError()`:

| Field | Required | Description |
|-------|----------|-------------|
| `message` | Yes | What happened (user-facing) |
| `status` | No | HTTP status code (default: 500) |
| `why` | No | Technical reason (for debugging) |
| `fix` | No | Actionable solution (for developers/users) |
| `link` | No | Documentation URL for more info |
| `cause` | No | Original error (if wrapping) |
| `internal` | No | Backend-only `Record<string, unknown>` — wide events / `log.error()` only; never HTTP, `toJSON()`, or client `parseError()` |

**Best practice**: At minimum, provide `message` and `status`. Add `why` and `fix` for errors that users can act on. Add `link` for documented error codes. Use `internal` for non-user-facing diagnostics (correlation IDs, processor codes) that must not reach browsers.

### Code Style

- Use TypeScript for all code
- Follow existing patterns in `packages/evlog/src/`
- Write tests for new functionality
- Document public APIs with JSDoc comments
- **No HTML comments in Vue templates** - Never use `<!-- comment -->` in `<template>` blocks. The code should be self-explanatory.

### Security: Preventing Sensitive Data Leakage

Wide events capture comprehensive context, making it easy to accidentally log sensitive data. **Never log:**

| Category | Examples | Risk |
|----------|----------|------|
| Credentials | Passwords, API keys, tokens, secrets | Account compromise |
| Payment data | Full card numbers, CVV, bank accounts | PCI compliance violation |
| Personal data (PII) | SSN, passport numbers, emails (unmasked) | Privacy laws (GDPR, CCPA) |
| Authentication | Session tokens, JWTs, refresh tokens | Session hijacking |

**Safe logging pattern** - explicitly select which fields to log:

```typescript
// ❌ DANGEROUS - logs everything including password
const body = await readBody(event)
log.set({ user: body })

// ✅ SAFE - explicitly select fields
log.set({
  user: {
    id: body.id,
    plan: body.plan,
    // password: body.password ← NEVER include
  },
})
```

**Sanitization helpers** - create utilities for masking data:

```typescript
// server/utils/sanitize.ts
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return '***'
  return `${local[0]}***@${domain[0]}***.${domain.split('.')[1]}`
}

export function maskCard(card: string): string {
  return `****${card.slice(-4)}`
}
```

**Production checklist**:

- [ ] No passwords or secrets in logs
- [ ] No full credit card numbers (only last 4 digits)
- [ ] No API keys or tokens
- [ ] PII is masked or omitted
- [ ] Request bodies are selectively logged (not `log.set({ body })`)

### Client-Side Logging

The `log` API also works on the client side (auto-imported in Nuxt):

```typescript
// In a Vue component or composable
log.info('checkout', 'User initiated checkout')
log.error({ action: 'payment', error: 'validation_failed' })
```

Client logs output to the browser console with colored tags in development.

`setMinLevel` is auto-imported in Nuxt (from `evlog/client`) — call it to change the client severity threshold at runtime (same as `initLog({ minLevel })`).

#### Client Transport

To send client logs to your server for centralized logging, enable the transport:

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['evlog/nuxt'],
  evlog: {
    transport: {
      enabled: true,  // Send client logs to server
    },
  },
})
```

When enabled:
1. Client logs are sent to `/api/_evlog/ingest` via POST
2. Server enriches with environment context (service, version, etc.)
3. `evlog:drain` hook is called with `source: 'client'`
4. External services receive the log

Identify client logs in your drain hook:

```typescript
nitroApp.hooks.hook('evlog:drain', async (ctx) => {
  if (ctx.event.source === 'client') {
    // Handle client logs specifically
  }
})
```

## Publishing

```bash
cd packages/evlog
bun run release
```

## Agent Skills

This repository includes agent skills for AI-assisted code review and evlog adoption.

### Available Skills

| Skill | Description |
|-------|-------------|
| `skills/review-logging-patterns` | Review code for logging patterns, suggest evlog adoption, guide wide event design |
| `skills/analyze-logs` | Analyze application logs from `.evlog/logs/` to debug errors, investigate performance, and understand behavior |
| `.agents/skills/create-adapter` | Create a new drain adapter (Axiom, OTLP, Sentry, etc.) |
| `.agents/skills/create-enricher` | Create a new event enricher (User Agent, Geo, etc.) |
| `.agents/skills/create-framework-integration` | Create a new framework integration (Hono, Elysia, Fastify, etc.) |

### Skill Structure

```
skills/
├── review-logging-patterns/
│   ├── SKILL.md              # Main skill instructions
│   └── references/
│       ├── wide-events.md    # Wide events patterns
│       ├── structured-errors.md # Error handling guide
│       ├── code-review.md    # Review checklist
│       └── drain-pipeline.md # Drain pipeline patterns
└── analyze-logs/
    └── SKILL.md              # Log analysis from .evlog/logs/
```

### Using Skills

Skills follow the [Agent Skills](https://agentskills.io/) specification. Compatible agents (Cursor, Claude Code, etc.) can discover and use these skills automatically.

To manually install with the skills CLI:

```bash
npx skills add https://www.evlog.dev
```

## Credits

This library is inspired by [Logging Sucks](https://loggingsucks.com/) by [Boris Tane](https://x.com/boristane). The wide events philosophy and structured logging approach are adapted from his excellent work on making logging more useful.
