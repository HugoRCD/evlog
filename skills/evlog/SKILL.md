---
name: review-logging-patterns
description: Review code for logging patterns and suggest evlog adoption. Detects console.log spam, unstructured errors, and missing context. Guides wide event design, structured error handling, request-scoped logging, and log draining with adapters (Axiom, OTLP, PostHog, Sentry, Better Stack).
license: MIT
metadata:
  author: HugoRCD
  version: "0.4"
---

# Review logging patterns

Review and improve logging patterns in TypeScript/JavaScript codebases. Transform scattered console.logs into structured wide events and convert generic errors into self-documenting structured errors.

## When to Use

- Reviewing code for logging best practices
- Converting console.log statements to structured logging
- Improving error handling with better context
- Setting up request-scoped logging in API routes
- Configuring log draining to external services

## Quick Reference

| Working on...           | Resource                                                           |
| ----------------------- | ------------------------------------------------------------------ |
| Wide events patterns    | [references/wide-events.md](references/wide-events.md)             |
| Error handling          | [references/structured-errors.md](references/structured-errors.md) |
| Code review checklist   | [references/code-review.md](references/code-review.md)             |
| Drain pipeline          | [references/drain-pipeline.md](references/drain-pipeline.md)       |

## Important: Auto-imports in Nuxt

In Nuxt applications, all evlog functions are **auto-imported** -- no import statements needed:

```typescript
// server/api/checkout.post.ts
export default defineEventHandler(async (event) => {
  const log = useLogger(event) // auto-imported
  log.set({ user: { id: 1, plan: 'pro' } })
  return { success: true }
})
```

```vue
<script setup>
log.info('checkout', 'User initiated checkout')
</script>
```

## Anti-Patterns to Detect

### 1. Console.log Spam

```typescript
// Multiple logs for one logical operation
console.log('Starting checkout')
console.log('User:', userId)
console.log('Cart:', cart)
```

**Transform to:**

```typescript
log.info({ action: 'checkout', userId, cart, duration: '1.2s' })
```

### 2. Generic Error Messages

```typescript
throw new Error('Something went wrong')
```

**Transform to:**

```typescript
import { createError } from 'evlog'

throw createError({
  message: 'Payment failed',
  status: 402,
  why: 'Card declined by issuer',
  fix: 'Try a different payment method or contact your bank',
})
```

### 3. Missing Request Context

```typescript
export default defineEventHandler(async (event) => {
  console.log('Processing request')
  // ...
})
```

**Transform to (Nuxt/Nitro):**

```typescript
export default defineEventHandler(async (event) => {
  const log = useLogger(event)
  log.set({ user: { id: user.id, plan: user.plan } })
  // emit() called automatically
})
```

**Transform to (Standalone TypeScript):**

```typescript
import { createRequestLogger } from 'evlog'

const log = createRequestLogger({ jobId: job.id, type: 'sync' })
log.set({ source: job.source, target: job.target })
log.emit()  // Manual emit for standalone
```

See [references/code-review.md](references/code-review.md) for the full review checklist and transformation examples.

## Installation

```bash
npm install evlog
```

### Nuxt

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['evlog/nuxt'],
  evlog: {
    env: { service: 'my-app' },
    include: ['/api/**'],
  },
})
```

### Nitro v3

```typescript
import { defineConfig } from 'nitro'
import evlog from 'evlog/nitro/v3'

export default defineConfig({
  modules: [evlog({ env: { service: 'my-api' } })],
})
```

Import `useLogger` from `evlog/nitro/v3` in routes.

### Nitro v2

```typescript
import { defineNitroConfig } from 'nitropack/config'
import evlog from 'evlog/nitro'

export default defineNitroConfig({
  modules: [evlog({ env: { service: 'my-api' } })],
})
```

Import `useLogger` from `evlog/nitro` in routes.

### Standalone TypeScript

```typescript
import { initLogger } from 'evlog'

initLogger({
  env: { service: 'my-worker', environment: 'production' },
  drain: createAxiomDrain(), // optional: direct drain without Nitro hooks
})
```

## Configuration Options

All options work in Nuxt (`evlog` key), Nitro (passed to `evlog()`), and standalone (`initLogger()`).

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Global toggle. When `false`, all operations become no-ops |
| `env.service` | `string` | `'app'` | Service name in logs |
| `env.environment` | `string` | Auto-detected | `'production'` \| `'development'` \| `'test'` |
| `env.version` | `string` | Auto-detected | App version (from package.json) |
| `env.commitHash` | `string` | Auto-detected | Git commit (from CI env vars) |
| `env.region` | `string` | Auto-detected | Deployment region (from cloud env vars) |
| `pretty` | `boolean` | `true` in dev | Pretty tree format vs JSON output |
| `stringify` | `boolean` | `true` | JSON.stringify output. Set `false` for Workers (expects objects) |
| `include` | `string[]` | All routes | Route glob patterns to log (e.g., `['/api/**']`) |
| `exclude` | `string[]` | None | Route glob patterns to exclude (takes precedence over `include`) |
| `routes` | `Record<string, { service }>` | -- | Route-specific service names |
| `sampling` | `SamplingConfig` | -- | See sampling section below |
| `transport` | `TransportConfig` | -- | Client log transport (Nuxt only) |
| `drain` | `(ctx) => void` | -- | Direct drain callback (standalone only, no Nitro hooks) |

### Sampling

Two strategies, composable:

```typescript
evlog: {
  sampling: {
    // Head sampling: random % per level (decided before request completes)
    rates: {
      info: 10,    // Keep 10% of info logs
      warn: 50,    // Keep 50%
      debug: 0,    // Disable
      error: 100,  // Always kept (default)
    },
    // Tail sampling: force-keep based on outcome (OR logic)
    keep: [
      { status: 400 },              // Keep if status >= 400
      { duration: 1000 },           // Keep if duration >= 1000ms
      { path: '/api/critical/**' }, // Keep if path matches
    ],
  },
}
```

**Custom tail sampling hook** (Nitro) for business logic:

```typescript
// server/plugins/evlog-custom.ts
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:emit:keep', (ctx) => {
    if (ctx.context.user?.premium) ctx.shouldKeep = true
  })
})
```

**Production tip** -- use `$production` in Nuxt to sample only in production:

```typescript
export default defineNuxtConfig({
  modules: ['evlog/nuxt'],
  evlog: { env: { service: 'my-app' } },
  $production: {
    evlog: { sampling: { rates: { info: 10, debug: 0 }, keep: [{ status: 400 }] } },
  },
})
```

### Route-Specific Config

```typescript
evlog: {
  routes: {
    '/api/billing/**': { service: 'billing-api' },
    '/api/auth/**': { service: 'auth-api' },
  },
}
```

### Client Transport (Nuxt only)

```typescript
evlog: {
  transport: {
    enabled: true,                    // Send client logs to server (default: false)
    endpoint: '/api/_evlog/ingest',   // Default endpoint
  },
}
```

When enabled, client `log.*` calls are sent to the server -> enriched -> drained via `evlog:drain` with `source: 'client'`.

### Event Enrichment

Add derived context after emit, before drain:

```typescript
// server/plugins/evlog-enrich.ts
import { createUserAgentEnricher, createGeoEnricher } from 'evlog/enrichers'

export default defineNitroPlugin((nitroApp) => {
  const enrichers = [createUserAgentEnricher(), createGeoEnricher()]

  nitroApp.hooks.hook('evlog:enrich', (ctx) => {
    for (const enricher of enrichers) enricher(ctx)
  })
})
```

Built-in enrichers: `createUserAgentEnricher()`, `createGeoEnricher()`, `createRequestSizeEnricher()`, `createTraceContextEnricher()` -- all from `evlog/enrichers`. Accept `{ overwrite?: boolean }`.

Custom enrichment -- mutate `ctx.event` directly:

```typescript
nitroApp.hooks.hook('evlog:enrich', (ctx) => {
  ctx.event.deploymentId = process.env.DEPLOYMENT_ID
  if (ctx.headers?.['x-tenant-id']) ctx.event.tenantId = ctx.headers['x-tenant-id']
})
```

### Nitro Hooks

| Hook | When | Use |
|------|------|-----|
| `evlog:enrich` | After emit, before drain | Add derived context to events |
| `evlog:drain` | After enrichment | Send events to external services |
| `evlog:emit:keep` | During emit | Custom tail sampling logic |
| `close` | Server shutdown | Flush drain pipeline buffers |

## Structured Error Levels

### Minimal (internal errors)

```typescript
throw createError({ message: 'Database connection failed', status: 500 })
```

### Standard (user-facing errors)

```typescript
throw createError({
  message: 'Payment failed',
  status: 402,
  why: 'Card declined by issuer',
})
```

### Complete (documented errors with actionable fix)

```typescript
throw createError({
  message: 'Payment failed',
  status: 402,
  why: 'Card declined by issuer - insufficient funds',
  fix: 'Please use a different payment method or contact your bank',
  link: 'https://docs.example.com/payments/declined',
})
```

See [references/structured-errors.md](references/structured-errors.md) for common error patterns and templates.

## Frontend Integration

Use `parseError()` to extract all fields at the top level:

```typescript
import { parseError } from 'evlog'

try {
  await $fetch('/api/checkout')
} catch (err) {
  const error = parseError(err)
  // Direct access: error.message, error.why, error.fix, error.link
  toast.add({
    title: error.message,
    description: error.why,
    color: 'error',
  })
}
```

## Log Draining & Adapters

evlog provides built-in adapters to send logs to external observability platforms.

### Built-in Adapters

| Adapter | Import | Env Vars |
|---------|--------|----------|
| Axiom | `evlog/axiom` | `NUXT_AXIOM_TOKEN`, `NUXT_AXIOM_DATASET` |
| OTLP | `evlog/otlp` | `NUXT_OTLP_ENDPOINT` |
| PostHog | `evlog/posthog` | `NUXT_POSTHOG_API_KEY`, `NUXT_POSTHOG_HOST` |
| Sentry | `evlog/sentry` | `NUXT_SENTRY_DSN` |
| Better Stack | `evlog/better-stack` | `NUXT_BETTER_STACK_SOURCE_TOKEN` |

### Quick Setup

All adapters follow the same pattern:

```typescript
// server/plugins/evlog-drain.ts
import { createAxiomDrain } from 'evlog/axiom'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:drain', createAxiomDrain())
})
```

### Multiple Destinations

```typescript
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

### Custom Adapter

```typescript
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

### Drain Pipeline (Production)

Wrap any adapter with `createDrainPipeline` for batching, retry with backoff, and buffer overflow protection.

```typescript
import type { DrainContext } from 'evlog'
import { createDrainPipeline } from 'evlog/pipeline'
import { createAxiomDrain } from 'evlog/axiom'

export default defineNitroPlugin((nitroApp) => {
  const pipeline = createDrainPipeline<DrainContext>({
    batch: { size: 50, intervalMs: 5000 },
    retry: { maxAttempts: 3, backoff: 'exponential' },
    onDropped: (events, error) => {
      console.error(`[evlog] Dropped ${events.length} events:`, error?.message)
    },
  })

  const drain = pipeline(createAxiomDrain())

  nitroApp.hooks.hook('evlog:drain', drain)
  nitroApp.hooks.hook('close', () => drain.flush())
})
```

See [references/drain-pipeline.md](references/drain-pipeline.md) for full options and patterns.

## Security: Sensitive Data

```typescript
// DANGEROUS - logs everything including password
log.set({ user: body })

// SAFE - explicitly select fields
log.set({ user: { id: body.id, plan: body.plan } })
```

Never log passwords, tokens, API keys, full card numbers, or PII. See [references/wide-events.md](references/wide-events.md) for sanitization helpers and production checklist.

## Loading Reference Files

Load based on what you're working on -- **do not load all at once**:

- Designing wide events -> [references/wide-events.md](references/wide-events.md)
- Improving errors -> [references/structured-errors.md](references/structured-errors.md)
- Full code review -> [references/code-review.md](references/code-review.md)
- Drain pipeline setup -> [references/drain-pipeline.md](references/drain-pipeline.md)
