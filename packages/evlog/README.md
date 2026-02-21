# evlog

[![npm version](https://img.shields.io/npm/v/evlog?color=black)](https://npmjs.com/package/evlog)
[![npm downloads](https://img.shields.io/npm/dm/evlog?color=black)](https://npm.chart.dev/evlog)
[![CI](https://img.shields.io/github/actions/workflow/status/HugoRCD/evlog/ci.yml?branch=main&color=black)](https://github.com/HugoRCD/evlog/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-black?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Documentation](https://img.shields.io/badge/Documentation-black?logo=readme&logoColor=white)](https://evlog.dev)
[![license](https://img.shields.io/github/license/HugoRCD/evlog?color=black)](https://github.com/HugoRCD/evlog/blob/main/LICENSE)

**Your logs are lying to you.**

A single request generates 10+ log lines. When production breaks at 3am, you're grep-ing through noise, praying you'll find signal. Your errors say "Something went wrong" -- thanks, very helpful.

**evlog fixes this.** One log per request. All context included. Errors that explain themselves.

## Why evlog?

### The Problem

```typescript
// server/api/checkout.post.ts

// Scattered logs - impossible to debug
console.log('Request received')
console.log('User:', user.id)
console.log('Cart loaded')
console.log('Payment failed')  // Good luck finding this at 3am

throw new Error('Something went wrong')
```

### The Solution

```typescript
// server/api/checkout.post.ts
import { useLogger } from 'evlog'

// One comprehensive event per request
export default defineEventHandler(async (event) => {
  const log = useLogger(event)  // Auto-injected by evlog

  log.set({ user: { id: user.id, plan: 'premium' } })
  log.set({ cart: { items: 3, total: 9999 } })
  log.error(error, { step: 'payment' })

  // Emits ONE event with ALL context + duration (automatic)
})
```

Output:

```json
{
  "timestamp": "2025-01-24T10:23:45.612Z",
  "level": "error",
  "service": "my-app",
  "method": "POST",
  "path": "/api/checkout",
  "duration": "1.2s",
  "user": { "id": "123", "plan": "premium" },
  "cart": { "items": 3, "total": 9999 },
  "error": { "message": "Card declined", "step": "payment" }
}
```

### Built for AI-Assisted Development

We're in the age of AI agents writing and debugging code. When an agent encounters an error, it needs **clear, structured context** to understand what happened and how to fix it.

Traditional logs force agents to grep through noise. evlog gives them:
- **One event per request** with all context in one place
- **Self-documenting errors** with `why` and `fix` fields
- **Structured JSON** that's easy to parse and reason about

Your AI copilot will thank you.

---

## Installation

```bash
npm install evlog
```

## Nuxt Integration

The recommended way to use evlog. Zero config, everything just works.

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

> **Tip:** Use `$production` to enable [sampling](#sampling) only in production:
> ```typescript
> export default defineNuxtConfig({
>   modules: ['evlog/nuxt'],
>   evlog: { env: { service: 'my-app' } },
>   $production: {
>     evlog: { sampling: { rates: { info: 10, warn: 50, debug: 0 } } },
>   },
> })
> ```

That's it. Now use `useLogger(event)` in any API route:

```typescript
// server/api/checkout.post.ts
import { useLogger, createError } from 'evlog'

export default defineEventHandler(async (event) => {
  const log = useLogger(event)

  // Authenticate user and add to wide event
  const user = await requireAuth(event)
  log.set({ user: { id: user.id, plan: user.plan } })

  // Load cart and add to wide event
  const cart = await getCart(user.id)
  log.set({ cart: { items: cart.items.length, total: cart.total } })

  // Process payment
  try {
    const payment = await processPayment(cart, user)
    log.set({ payment: { id: payment.id, method: payment.method } })
  } catch (error) {
    log.error(error, { step: 'payment' })

    throw createError({
      message: 'Payment failed',
      status: 402,
      why: error.message,
      fix: 'Try a different payment method or contact your bank',
    })
  }

  // Create order
  const order = await createOrder(cart, user)
  log.set({ order: { id: order.id, status: order.status } })

  return order
  // log.emit() called automatically at request end
})
```

The wide event emitted at the end contains **everything**:

```json
{
  "timestamp": "2026-01-24T10:23:45.612Z",
  "level": "info",
  "service": "my-app",
  "method": "POST",
  "path": "/api/checkout",
  "duration": "1.2s",
  "user": { "id": "user_123", "plan": "premium" },
  "cart": { "items": 3, "total": 9999 },
  "payment": { "id": "pay_xyz", "method": "card" },
  "order": { "id": "order_abc", "status": "created" },
  "status": 200
}
```

## Nitro Integration

Works with **any framework powered by Nitro**: Nuxt, Analog, Vinxi, SolidStart, TanStack Start, and more.

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

Then use `useLogger` in any route. Import from `evlog/nitro/v3` (v3) or `evlog/nitro` (v2):

```typescript
// routes/api/documents/[id]/export.post.ts
// Nitro v3: import { defineHandler } from 'nitro/h3' + import { useLogger } from 'evlog/nitro/v3'
// Nitro v2: import { defineEventHandler } from 'h3' + import { useLogger } from 'evlog/nitro'
import { defineEventHandler } from 'h3'
import { useLogger } from 'evlog/nitro'
import { createError } from 'evlog'

export default defineEventHandler(async (event) => {
  const log = useLogger(event)

  // Get document ID from route params
  const documentId = getRouterParam(event, 'id')
  log.set({ document: { id: documentId } })

  // Parse request body for export options
  const body = await readBody(event)
  log.set({ export: { format: body.format, includeComments: body.includeComments } })

  // Load document from database
  const document = await db.documents.findUnique({ where: { id: documentId } })
  if (!document) {
    throw createError({
      message: 'Document not found',
      status: 404,
      why: `No document with ID "${documentId}" exists`,
      fix: 'Check the document ID and try again',
    })
  }
  log.set({ document: { id: documentId, title: document.title, pages: document.pages.length } })

  // Generate export
  try {
    const exportResult = await generateExport(document, body.format)
    log.set({ export: { format: body.format, size: exportResult.size, pages: exportResult.pages } })

    return { url: exportResult.url, expiresAt: exportResult.expiresAt }
  } catch (error) {
    log.error(error, { step: 'export-generation' })

    throw createError({
      message: 'Export failed',
      status: 500,
      why: `Failed to generate ${body.format} export: ${error.message}`,
      fix: 'Try a different format or contact support',
    })
  }
  // log.emit() called automatically - outputs one comprehensive wide event
})
```

Output when the export completes:

```json
{
  "timestamp": "2025-01-24T14:32:10.123Z",
  "level": "info",
  "service": "document-api",
  "method": "POST",
  "path": "/api/documents/doc_123/export",
  "duration": "2.4s",
  "document": { "id": "doc_123", "title": "Q4 Report", "pages": 24 },
  "export": { "format": "pdf", "size": 1240000, "pages": 24 },
  "status": 200
}
```

## Standalone TypeScript

For scripts, workers, or any TypeScript project:

```typescript
// scripts/migrate.ts
import { initLogger, log, createRequestLogger } from 'evlog'

// Initialize once at script start
initLogger({
  env: {
    service: 'migration-script',
    environment: 'production',
  },
})

// Simple logging
log.info('migration', 'Starting database migration')
log.info({ action: 'migration', tables: ['users', 'orders'] })

// Or use request logger for a logical operation
const migrationLog = createRequestLogger({ action: 'full-migration' })

migrationLog.set({ tables: ['users', 'orders', 'products'] })
migrationLog.set({ rowsProcessed: 15000 })
migrationLog.emit()
```

```typescript
// workers/sync-job.ts
import { initLogger, createRequestLogger, createError } from 'evlog'

initLogger({
  env: {
    service: 'sync-worker',
    environment: process.env.NODE_ENV,
  },
})

async function processSyncJob(job: Job) {
  const log = createRequestLogger({ jobId: job.id, type: 'sync' })

  try {
    log.set({ source: job.source, target: job.target })

    const result = await performSync(job)
    log.set({ recordsSynced: result.count })

    return result
  } catch (error) {
    log.error(error, { step: 'sync' })
    throw error
  } finally {
    log.emit()
  }
}
```

## Cloudflare Workers

Use the Workers adapter for structured logs and correct platform severity.

```typescript
// src/index.ts
import { initWorkersLogger, createWorkersLogger } from 'evlog/workers'

initWorkersLogger({
  env: { service: 'edge-api' },
})

export default {
  async fetch(request: Request) {
    const log = createWorkersLogger(request)

    try {
      log.set({ route: 'health' })
      const response = new Response('ok', { status: 200 })
      log.emit({ status: response.status })
      return response
    } catch (error) {
      log.error(error as Error)
      log.emit({ status: 500 })
      throw error
    }
  },
}
```

Disable invocation logs to avoid duplicate request logs:

```toml
# wrangler.toml
[observability.logs]
invocation_logs = false
```

Notes:
- `requestId` defaults to `cf-ray` when available
- `request.cf` is included (colo, country, asn) unless disabled
- Use `headerAllowlist` to avoid logging sensitive headers

## Hono

Use the standalone API to create one wide event per request from a Hono middleware.

```typescript
// src/index.ts
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { createRequestLogger, initLogger } from 'evlog'

initLogger({
  env: { service: 'hono-api' },
})

const app = new Hono()

app.use('*', async (c, next) => {
  const startedAt = Date.now()
  const log = createRequestLogger({ method: c.req.method, path: c.req.path })

  try {
    await next()
  } catch (error) {
    log.error(error as Error)
    throw error
  } finally {
    log.emit({
      status: c.res.status,
      duration: Date.now() - startedAt,
    })
  }
})

app.get('/health', (c) => c.json({ ok: true }))

serve({ fetch: app.fetch, port: 3000 })
```

See the full [hono example](https://github.com/HugoRCD/evlog/tree/main/examples/hono) for a complete working project.

## Browser

Use the `log` API on the client side for structured browser logging:

```typescript
import { log } from 'evlog/browser'

log.info('checkout', 'User initiated checkout')
log.error({ action: 'payment', error: 'validation_failed' })
```

In Nuxt, `log` is auto-imported -- no import needed in Vue components:

```vue
<script setup>
log.info('checkout', 'User initiated checkout')
</script>
```

Client logs output to the browser console with colored tags in development.

### Client Transport

To send client logs to the server for centralized logging, enable the transport:

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

## Structured Errors

Errors should tell you **what** happened, **why**, and **how to fix it**.

```typescript
// server/api/repos/sync.post.ts
import { useLogger, createError } from 'evlog'

export default defineEventHandler(async (event) => {
  const log = useLogger(event)

  log.set({ repo: { owner: 'acme', name: 'my-project' } })

  try {
    const result = await syncWithGitHub()
    log.set({ sync: { commits: result.commits, files: result.files } })
    return result
  } catch (error) {
    log.error(error, { step: 'github-sync' })

    throw createError({
      message: 'Failed to sync repository',
      status: 503,
      why: 'GitHub API rate limit exceeded',
      fix: 'Wait 1 hour or use a different token',
      link: 'https://docs.github.com/en/rest/rate-limit',
      cause: error,
    })
  }
})
```

Console output (development):

```
Error: Failed to sync repository
Why: GitHub API rate limit exceeded
Fix: Wait 1 hour or use a different token
More info: https://docs.github.com/en/rest/rate-limit
```

## Enrichment Hook

Use the `evlog:enrich` hook to add derived context after emit, before drain.

```typescript
// server/plugins/evlog-enrich.ts
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:enrich', (ctx) => {
    ctx.event.deploymentId = process.env.DEPLOYMENT_ID
  })
})
```

### Built-in Enrichers

```typescript
// server/plugins/evlog-enrich.ts
import {
  createGeoEnricher,
  createRequestSizeEnricher,
  createTraceContextEnricher,
  createUserAgentEnricher,
} from 'evlog/enrichers'

export default defineNitroPlugin((nitroApp) => {
  const enrich = [
    createUserAgentEnricher(),
    createGeoEnricher(),
    createRequestSizeEnricher(),
    createTraceContextEnricher(),
  ]

  nitroApp.hooks.hook('evlog:enrich', (ctx) => {
    for (const enricher of enrich) enricher(ctx)
  })
})
```

Each enricher adds a specific field to the event:

| Enricher | Event Field | Shape |
|----------|-------------|-------|
| `createUserAgentEnricher()` | `event.userAgent` | `{ raw, browser?: { name, version? }, os?: { name, version? }, device?: { type } }` |
| `createGeoEnricher()` | `event.geo` | `{ country?, region?, regionCode?, city?, latitude?, longitude? }` |
| `createRequestSizeEnricher()` | `event.requestSize` | `{ requestBytes?, responseBytes? }` |
| `createTraceContextEnricher()` | `event.traceContext` + `event.traceId` + `event.spanId` | `{ traceparent?, tracestate?, traceId?, spanId? }` |

All enrichers accept an optional `{ overwrite?: boolean }` option. By default (`overwrite: false`), user-provided data on the event takes precedence over enricher-computed values. Set `overwrite: true` to always replace existing fields.

> **Cloudflare geo note:** Only `cf-ipcountry` is a real Cloudflare HTTP header. The `cf-region`, `cf-city`, `cf-latitude`, `cf-longitude` headers are NOT standard -- they are properties of `request.cf`. For full geo data on Cloudflare, write a custom enricher that reads `request.cf`, or use a Workers middleware to forward `cf` properties as custom headers.

### Custom Enrichers

The `evlog:enrich` hook receives an `EnrichContext` with these fields:

```typescript
interface EnrichContext {
  event: WideEvent        // The emitted wide event (mutable -- modify it directly)
  request?: {             // Request metadata
    method?: string
    path?: string
    requestId?: string
  }
  headers?: Record<string, string>  // Safe HTTP headers (sensitive headers filtered)
  response?: {            // Response metadata
    status?: number
    headers?: Record<string, string>
  }
}
```

Example custom enricher:

```typescript
// server/plugins/evlog-enrich.ts
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:enrich', (ctx) => {
    // Add deployment metadata
    ctx.event.deploymentId = process.env.DEPLOYMENT_ID
    ctx.event.region = process.env.FLY_REGION

    // Extract data from headers
    const tenantId = ctx.headers?.['x-tenant-id']
    if (tenantId) {
      ctx.event.tenantId = tenantId
    }
  })
})
```

## Adapters

Send your logs to external observability platforms with built-in adapters.

### Axiom

```typescript
// server/plugins/evlog-drain.ts
import { createAxiomDrain } from 'evlog/axiom'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:drain', createAxiomDrain())
})
```

Set environment variables:

```bash
NUXT_AXIOM_TOKEN=xaat-your-token
NUXT_AXIOM_DATASET=your-dataset
```

### OTLP (OpenTelemetry)

Works with Grafana, Datadog, Honeycomb, and any OTLP-compatible backend.

```typescript
// server/plugins/evlog-drain.ts
import { createOTLPDrain } from 'evlog/otlp'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:drain', createOTLPDrain())
})
```

Set environment variables:

```bash
NUXT_OTLP_ENDPOINT=http://localhost:4318
```

### PostHog

```typescript
// server/plugins/evlog-drain.ts
import { createPostHogDrain } from 'evlog/posthog'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:drain', createPostHogDrain())
})
```

Set environment variables:

```bash
NUXT_POSTHOG_API_KEY=phc_your-key
NUXT_POSTHOG_HOST=https://us.i.posthog.com  # Optional: for EU or self-hosted
```

### Sentry

```typescript
// server/plugins/evlog-drain.ts
import { createSentryDrain } from 'evlog/sentry'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:drain', createSentryDrain())
})
```

Set environment variables:

```bash
NUXT_SENTRY_DSN=https://public@o0.ingest.sentry.io/123
```

### Better Stack

```typescript
// server/plugins/evlog-drain.ts
import { createBetterStackDrain } from 'evlog/better-stack'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:drain', createBetterStackDrain())
})
```

Set environment variables:

```bash
NUXT_BETTER_STACK_SOURCE_TOKEN=your-source-token
```

### Multiple Destinations

Send logs to multiple services:

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

### Custom Adapters

Build your own adapter for any destination:

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

> See the [full documentation](https://evlog.hrcd.fr/adapters/overview) for adapter configuration options, troubleshooting, and advanced patterns.

## Drain Pipeline

For production use, wrap your drain adapter with `createDrainPipeline` to get **batching**, **retry with backoff**, and **buffer overflow protection**.

Without a pipeline, each event triggers a separate network call. The pipeline buffers events and sends them in batches, reducing overhead and handling transient failures automatically.

```typescript
// server/plugins/evlog-drain.ts
import type { DrainContext } from 'evlog'
import { createDrainPipeline } from 'evlog/pipeline'
import { createAxiomDrain } from 'evlog/axiom'

export default defineNitroPlugin((nitroApp) => {
  const pipeline = createDrainPipeline<DrainContext>({
    batch: { size: 50, intervalMs: 5000 },
    retry: { maxAttempts: 3, backoff: 'exponential', initialDelayMs: 1000 },
    onDropped: (events, error) => {
      console.error(`[evlog] Dropped ${events.length} events:`, error?.message)
    },
  })

  const drain = pipeline(createAxiomDrain())

  nitroApp.hooks.hook('evlog:drain', drain)
  nitroApp.hooks.hook('close', () => drain.flush())
})
```

### How it works

1. Events are buffered in memory as they arrive
2. A batch is flushed when either the **batch size** is reached or the **interval** expires (whichever comes first)
3. If the drain function fails, the batch is retried with the configured **backoff strategy**
4. If all retries are exhausted, `onDropped` is called with the lost events
5. If the buffer exceeds `maxBufferSize`, the oldest events are dropped to prevent memory leaks

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `batch.size` | `50` | Maximum events per batch |
| `batch.intervalMs` | `5000` | Max time (ms) before flushing a partial batch |
| `retry.maxAttempts` | `3` | Total attempts (including first) |
| `retry.backoff` | `'exponential'` | `'exponential'` \| `'linear'` \| `'fixed'` |
| `retry.initialDelayMs` | `1000` | Base delay for first retry |
| `retry.maxDelayMs` | `30000` | Upper bound for any retry delay |
| `maxBufferSize` | `1000` | Max buffered events before dropping oldest |
| `onDropped` | -- | Callback when events are dropped |

### Returned drain function

The function returned by `pipeline(drain)` is hook-compatible and exposes:

- **`drain(ctx)`** -- Push a single event into the buffer
- **`drain.flush()`** -- Force-flush all buffered events (call on server shutdown)
- **`drain.pending`** -- Number of events currently buffered

## API Reference

### `initLogger(config)`

Initialize the logger. Required for standalone usage, automatic with Nuxt/Nitro plugins.

```typescript
initLogger({
  enabled: boolean       // Optional. Enable/disable all logging (default: true)
  env: {
    service: string      // Service name
    environment: string  // 'production' | 'development' | 'test'
    version?: string     // App version
    commitHash?: string  // Git commit
    region?: string      // Deployment region
  },
  pretty?: boolean       // Pretty print (default: true in dev)
  stringify?: boolean    // JSON.stringify output (default: true, false for Workers)
  include?: string[]     // Route patterns to log (glob), e.g. ['/api/**']
  sampling?: {
    rates?: {            // Head sampling (random per level)
      info?: number      // 0-100, default 100
      warn?: number      // 0-100, default 100
      debug?: number     // 0-100, default 100
      error?: number     // 0-100, default 100 (always logged unless set to 0)
    }
    keep?: Array<{       // Tail sampling (force keep based on outcome)
      status?: number    // Keep if status >= value
      duration?: number  // Keep if duration >= value (ms)
      path?: string      // Keep if path matches glob pattern
    }>
  }
})
```

### Sampling

At scale, logging everything can become expensive. evlog supports two sampling strategies:

#### Head Sampling (rates)

Random sampling based on log level, decided before the request completes:

```typescript
initLogger({
  sampling: {
    rates: {
      info: 10,   // Keep 10% of info logs
      warn: 50,   // Keep 50% of warning logs
      debug: 0,   // Disable debug logs
      // error defaults to 100% (always logged)
    },
  },
})
```

#### Tail Sampling (keep)

Force-keep logs based on request outcome, evaluated after the request completes. Useful to always capture slow requests or critical paths:

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['evlog/nuxt'],
  evlog: {
    sampling: {
      rates: { info: 10 },  // Only 10% of info logs
      keep: [
        { duration: 1000 },           // Always keep if duration >= 1000ms
        { status: 400 },              // Always keep if status >= 400
        { path: '/api/critical/**' }, // Always keep critical paths
      ],
    },
  },
})
```

#### Custom Tail Sampling Hook

For business-specific conditions (premium users, feature flags), use the `evlog:emit:keep` Nitro hook:

```typescript
// server/plugins/evlog-custom.ts
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:emit:keep', (ctx) => {
    // Always keep logs for premium users
    if (ctx.context.user?.premium) {
      ctx.shouldKeep = true
    }
  })
})
```

### Pretty Output Format

In development, evlog uses a compact tree format:

```
16:45:31.060 INFO [my-app] GET /api/checkout 200 in 234ms
  |- user: id=123 plan=premium
  |- cart: items=3 total=9999
  +- payment: id=pay_xyz method=card
```

In production (`pretty: false`), logs are emitted as JSON for machine parsing.

### `log`

Simple logging API.

```typescript
log.info('tag', 'message')     // Tagged log
log.info({ key: 'value' })     // Wide event
log.error('tag', 'message')
log.warn('tag', 'message')
log.debug('tag', 'message')
```

### `createRequestLogger(options)`

Create a request-scoped logger for wide events.

```typescript
const log = createRequestLogger({
  method: 'POST',
  path: '/checkout',
  requestId: 'req_123',
})

log.set({ user: { id: '123' } })  // Add context
log.error(error, { step: 'x' })   // Log error with context
log.emit()                         // Emit final event
log.getContext()                   // Get current context
```

### `initWorkersLogger(options?)`

Initialize evlog for Cloudflare Workers (object logs + correct severity).

```typescript
import { initWorkersLogger } from 'evlog/workers'

initWorkersLogger({
  env: { service: 'edge-api' },
})
```

### `createWorkersLogger(request, options?)`

Create a request-scoped logger for Workers. Auto-extracts `cf-ray`, `request.cf`, method, and path.

```typescript
import { createWorkersLogger } from 'evlog/workers'

const log = createWorkersLogger(request, {
  requestId: 'custom-id',      // Override cf-ray (default: cf-ray header)
  headers: ['x-request-id'],   // Headers to include (default: none)
})

log.set({ user: { id: '123' } })
log.emit({ status: 200 })
```

### `createError(options)`

Create a structured error with HTTP status support. Import from `evlog` directly to avoid conflicts with Nuxt/Nitro's `createError`.

> **Note**: `createEvlogError` is also available as an auto-imported alias in Nuxt/Nitro to avoid conflicts.

```typescript
import { createError } from 'evlog'

createError({
  message: string   // What happened
  status?: number   // HTTP status code (default: 500)
  why?: string      // Why it happened
  fix?: string      // How to fix it
  link?: string     // Documentation URL
  cause?: Error     // Original error
})
```

### `parseError(error)`

Parse a caught error into a flat structure with all evlog fields. Auto-imported in Nuxt.

```typescript
import { parseError } from 'evlog'

try {
  await $fetch('/api/checkout')
} catch (err) {
  const error = parseError(err)

  // Direct access to all fields
  console.log(error.message)  // "Payment failed"
  console.log(error.status)   // 402
  console.log(error.why)      // "Card declined"
  console.log(error.fix)      // "Try another card"
  console.log(error.link)     // "https://docs.example.com/..."

  // Use with toast
  toast.add({
    title: error.message,
    description: error.why,
    color: 'error',
  })
}
```

## Framework Support

| Framework | Integration |
|-----------|-------------|
| **Nuxt** | `modules: ['evlog/nuxt']` |
| **Next.js** | `createEvlog()` factory with `import { createEvlog } from 'evlog/next'` ([example](./examples/nextjs)) |
| **Nitro v3** | `modules: [evlog()]` with `import evlog from 'evlog/nitro/v3'` |
| **Nitro v2** | `modules: [evlog()]` with `import evlog from 'evlog/nitro'` |
| **Analog** | Nitro v2 module setup |
| **Vinxi** | Nitro v2 module setup |
| **SolidStart** | Nitro v2 module setup ([example](./examples/solidstart)) |
| **TanStack Start** | Nitro v3 module setup ([example](./examples/tanstack-start)) |

## Agent Skills

evlog provides [Agent Skills](https://github.com/boristane/agent-skills) to help AI coding assistants understand and implement proper logging patterns in your codebase.

### Installation

```bash
npx add-skill hugorcd/evlog
```

### What it does

Once installed, your AI assistant will:
- Review your logging code and suggest wide event patterns
- Help refactor scattered `console.log` calls into structured events
- Guide you to use `createError()` for self-documenting errors
- Ensure proper use of `useLogger(event)` in Nuxt/Nitro routes

### Examples

```
Add logging to this endpoint
Review my logging code
Help me set up logging for this service
```

## Philosophy

Inspired by [Logging Sucks](https://loggingsucks.com/) by [Boris Tane](https://x.com/boristane).

1. **Wide Events**: One log per request with all context
2. **Structured Errors**: Errors that explain themselves
3. **Request Scoping**: Accumulate context, emit once
4. **Pretty for Dev, JSON for Prod**: Human-readable locally, machine-parseable in production

## License

[MIT](./LICENSE)

Made by [@HugoRCD](https://github.com/HugoRCD)
