---
name: review-logging-patterns
description: Review code for logging patterns and suggest evlog adoption. Guides setup on Nuxt, Next.js, Nitro, Hono, Cloudflare Workers, and standalone TypeScript. Detects console.log spam, unstructured errors, and missing context. Covers wide events, structured errors, drain adapters (Axiom, OTLP, PostHog, Sentry, Better Stack), sampling, and enrichers.
license: MIT
metadata:
  author: HugoRCD
  version: "0.5"
---

# Review logging patterns

Review and improve logging patterns in TypeScript/JavaScript codebases. Transform scattered console.logs into structured wide events and convert generic errors into self-documenting structured errors.

## When to Use

- Setting up evlog in a new or existing project (any supported framework)
- Reviewing code for logging best practices
- Converting console.log statements to structured logging
- Improving error handling with better context
- Configuring log draining, sampling, or enrichment

## Quick Reference

| Working on...           | Resource                                                           |
| ----------------------- | ------------------------------------------------------------------ |
| Wide events patterns    | [references/wide-events.md](references/wide-events.md)             |
| Error handling          | [references/structured-errors.md](references/structured-errors.md) |
| Code review checklist   | [references/code-review.md](references/code-review.md)             |
| Drain pipeline          | [references/drain-pipeline.md](references/drain-pipeline.md)       |

## Installation

```bash
npm install evlog
```

---

## Framework Setup

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

All evlog functions (`useLogger`, `createError`, `parseError`, `log`) are **auto-imported** — no import statements needed.

```typescript
// server/api/checkout.post.ts — no imports needed
export default defineEventHandler(async (event) => {
  const log = useLogger(event)
  log.set({ user: { id: user.id, plan: user.plan } })
  return { success: true }
})
```

Drain, enrich, and tail sampling use Nitro hooks in server plugins:

```typescript
// server/plugins/evlog-drain.ts
import { createAxiomDrain } from 'evlog/axiom'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:drain', createAxiomDrain())
})
```

Client transport (auto-configured Vue plugin):

```typescript
// nuxt.config.ts
evlog: {
  transport: { enabled: true },  // logs sent to /api/_evlog/ingest
}
```

Client-side: `log`, `setIdentity`, `clearIdentity` are auto-imported in components.

### Next.js

**Step 1: Create central config** — all exports come from here:

```typescript
// lib/evlog.ts
import type { DrainContext } from 'evlog'
import { createEvlog } from 'evlog/next'
import { createUserAgentEnricher, createRequestSizeEnricher } from 'evlog/enrichers'
import { createDrainPipeline } from 'evlog/pipeline'

const enrichers = [createUserAgentEnricher(), createRequestSizeEnricher()]
const pipeline = createDrainPipeline<DrainContext>({ batch: { size: 50, intervalMs: 5000 } })
const drain = pipeline(createAxiomDrain({ dataset: 'logs', token: process.env.AXIOM_TOKEN! }))

export const { withEvlog, useLogger, log, createError } = createEvlog({
  service: 'my-app',
  sampling: {
    rates: { info: 10 },
    keep: [{ status: 400 }, { duration: 1000 }],
  },
  routes: {
    '/api/auth/**': { service: 'auth-service' },
    '/api/checkout/**': { service: 'checkout-service' },
  },
  keep: (ctx) => {
    const user = ctx.context.user as { premium?: boolean } | undefined
    if (user?.premium) ctx.shouldKeep = true
  },
  enrich: (ctx) => {
    for (const enricher of enrichers) enricher(ctx)
  },
  drain,
})
```

**Step 2: Wrap route handlers** with `withEvlog()`:

```typescript
// app/api/checkout/route.ts
import { withEvlog, useLogger } from '@/lib/evlog'

export const POST = withEvlog(async (request: Request) => {
  const log = useLogger()  // Zero arguments — uses AsyncLocalStorage
  log.set({ user: { id: 'user_123', plan: 'enterprise' } })
  log.set({ cart: { items: 3, total: 14999 } })
  return Response.json({ success: true })
})
```

**Step 3: Server Actions** — same `withEvlog()` wrapper:

```typescript
// app/actions.ts
'use server'
import { withEvlog, useLogger } from '@/lib/evlog'

export const checkout = withEvlog(async (formData: FormData) => {
  const log = useLogger()
  log.set({ action: 'checkout', source: 'server-action' })
  return { success: true }
})
```

**Step 4: Middleware** (optional — sets `x-request-id` + timing headers):

```typescript
// proxy.ts
import { evlogMiddleware } from 'evlog/next'
export const proxy = evlogMiddleware()
export const config = { matcher: ['/api/:path*'] }
```

**Step 5: Client Provider** — wrap root layout:

```tsx
// app/layout.tsx
import { EvlogProvider } from 'evlog/next/client'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <EvlogProvider service="my-app" transport={{ enabled: true, endpoint: '/api/evlog/ingest' }}>
          {children}
        </EvlogProvider>
      </body>
    </html>
  )
}
```

**Step 6: Client logging** — in any client component:

```tsx
'use client'
import { log, setIdentity, clearIdentity } from 'evlog/next/client'

setIdentity({ userId: 'usr_123' })
log.info({ action: 'checkout_click' })
clearIdentity()
```

**Step 7: Client ingest endpoint** — receives client logs:

```typescript
// app/api/evlog/ingest/route.ts
import { NextRequest } from 'next/server'

const VALID_LEVELS = ['info', 'error', 'warn', 'debug'] as const

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (origin && new URL(origin).host !== host) {
    return Response.json({ error: 'Invalid origin' }, { status: 403 })
  }
  const body = await request.json()
  if (!body?.timestamp || !body?.level || !VALID_LEVELS.includes(body.level)) {
    return Response.json({ error: 'Invalid payload' }, { status: 400 })
  }
  const { service: _, ...sanitized } = body
  console.log('[CLIENT LOG]', JSON.stringify({ ...sanitized, service: 'my-app', source: 'client' }))
  return new Response(null, { status: 204 })
}
```

### Nitro v3

```typescript
// nitro.config.ts
import { defineConfig } from 'nitro'
import evlog from 'evlog/nitro/v3'

export default defineConfig({
  modules: [evlog({ env: { service: 'my-api' } })],
})
```

```typescript
// routes/api/checkout.post.ts
import { defineHandler } from 'nitro/h3'
import { useLogger } from 'evlog/nitro/v3'

export default defineHandler(async (event) => {
  const log = useLogger(event)
  log.set({ action: 'checkout' })
  return { ok: true }
})
```

### Nitro v2

```typescript
// nitro.config.ts
import { defineNitroConfig } from 'nitropack/config'
import evlog from 'evlog/nitro'

export default defineNitroConfig({
  modules: [evlog({ env: { service: 'my-api' } })],
})
```

Import `useLogger` from `evlog/nitro` in routes.

### Hono

```typescript
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { createRequestLogger, initLogger, createError, parseError } from 'evlog'

initLogger({ env: { service: 'hono-api' } })

const app = new Hono()

app.use('*', async (c, next) => {
  const startedAt = Date.now()
  const log = createRequestLogger({ method: c.req.method, path: c.req.path })
  c.set('log', log)
  try {
    await next()
  } catch (error) {
    log.error(error as Error)
    throw error
  } finally {
    log.emit({ status: c.res.status, duration: Date.now() - startedAt })
  }
})

app.get('/health', (c) => c.json({ ok: true }))

app.onError((error, c) => {
  const parsed = parseError(error)
  return c.json(parsed, { status: parsed.status || 500 })
})

serve({ fetch: app.fetch, port: 3000 })
```

### Cloudflare Workers

```typescript
import { initWorkersLogger, createWorkersLogger } from 'evlog/workers'

initWorkersLogger({ env: { service: 'edge-api' } })

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

### Standalone TypeScript

```typescript
import { initLogger, createRequestLogger } from 'evlog'

initLogger({ env: { service: 'my-worker', environment: 'production' } })

const log = createRequestLogger({ jobId: job.id })
log.set({ source: job.source, recordsSynced: 150 })
log.emit()  // Manual emit required in standalone
```

---

## Configuration Options

All options work in Nuxt (`evlog` key), Nitro (passed to `evlog()`), Next.js (`createEvlog()`), and standalone (`initLogger()`).

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `env.service` / `service` | `string` | `'app'` | Service name in logs |
| `enabled` | `boolean` | `true` | Global toggle (no-ops when false) |
| `pretty` | `boolean` | `true` in dev | Pretty tree format vs JSON |
| `include` | `string[]` | All routes | Route glob patterns to log |
| `exclude` | `string[]` | None | Route patterns to exclude (takes precedence) |
| `routes` | `Record<string, { service }>` | -- | Route-specific service names |
| `sampling.rates` | `object` | -- | Head sampling: `{ info: 10, warn: 50 }` (0-100%) |
| `sampling.keep` | `array` | -- | Tail sampling: `[{ status: 400 }, { duration: 1000 }]` |
| `drain` | `(ctx) => void` | -- | Drain callback (Next.js, standalone) |
| `enrich` | `(ctx) => void` | -- | Enrich callback (Next.js) |
| `keep` | `(ctx) => void` | -- | Custom tail sampling callback (Next.js) |

### Nitro Hooks (Nuxt, Nitro v2/v3)

| Hook | When | Use |
|------|------|-----|
| `evlog:drain` | After enrichment | Send events to external services |
| `evlog:enrich` | After emit, before drain | Add derived context |
| `evlog:emit:keep` | During emit | Custom tail sampling logic |
| `close` | Server shutdown | Flush drain pipeline buffers |

---

## Drain Adapters

| Adapter | Import | Env Vars |
|---------|--------|----------|
| Axiom | `evlog/axiom` | `NUXT_AXIOM_TOKEN`, `NUXT_AXIOM_DATASET` |
| OTLP | `evlog/otlp` | `NUXT_OTLP_ENDPOINT` |
| PostHog | `evlog/posthog` | `NUXT_POSTHOG_API_KEY`, `NUXT_POSTHOG_HOST` |
| Sentry | `evlog/sentry` | `NUXT_SENTRY_DSN` |
| Better Stack | `evlog/better-stack` | `NUXT_BETTER_STACK_SOURCE_TOKEN` |

Setup pattern per framework:

```typescript
// Nuxt/Nitro: server/plugins/evlog-drain.ts
import { createAxiomDrain } from 'evlog/axiom'
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:drain', createAxiomDrain())
})

// Next.js: in lib/evlog.ts, pass drain to createEvlog()
import { createAxiomDrain } from 'evlog/axiom'
import { createDrainPipeline } from 'evlog/pipeline'
const pipeline = createDrainPipeline<DrainContext>({ batch: { size: 50 } })
const drain = pipeline(createAxiomDrain())
// then: createEvlog({ ..., drain })

// Standalone: pass drain to initLogger()
initLogger({ env: { service: 'my-app' }, drain })
```

See [references/drain-pipeline.md](references/drain-pipeline.md) for batching, retry, and buffer overflow config.

---

## Enrichers

Built-in: `createUserAgentEnricher()`, `createGeoEnricher()`, `createRequestSizeEnricher()`, `createTraceContextEnricher()` — all from `evlog/enrichers`.

```typescript
// Nuxt/Nitro: server/plugins/evlog-enrich.ts
import { createUserAgentEnricher, createGeoEnricher } from 'evlog/enrichers'
export default defineNitroPlugin((nitroApp) => {
  const enrichers = [createUserAgentEnricher(), createGeoEnricher()]
  nitroApp.hooks.hook('evlog:enrich', (ctx) => {
    for (const enricher of enrichers) enricher(ctx)
  })
})

// Next.js: in lib/evlog.ts
createEvlog({
  enrich: (ctx) => {
    for (const enricher of enrichers) enricher(ctx)
    ctx.event.region = process.env.VERCEL_REGION
  },
})
```

---

## Structured Errors

```typescript
import { createError } from 'evlog'  // or auto-imported in Nuxt

// Minimal
throw createError({ message: 'Database connection failed', status: 500 })

// Standard
throw createError({ message: 'Payment failed', status: 402, why: 'Card declined by issuer' })

// Complete
throw createError({
  message: 'Payment failed',
  status: 402,
  why: 'Card declined by issuer - insufficient funds',
  fix: 'Please use a different payment method or contact your bank',
  link: 'https://docs.example.com/payments/declined',
  cause: originalError,
})
```

Frontend — extract all fields with `parseError()`:

```typescript
import { parseError } from 'evlog'

const error = parseError(err)
// error.message, error.status, error.why, error.fix, error.link
```

See [references/structured-errors.md](references/structured-errors.md) for common patterns and templates.

---

## Anti-Patterns to Detect

| Anti-Pattern | Fix |
|--------------|-----|
| Multiple `console.log` in one function | Single wide event with `log.set()` |
| `throw new Error('...')` | `throw createError({ message, status, why, fix })` |
| `console.error(e); throw e` | `log.error(e); throw createError(...)` |
| No logging in request handlers | Add `useLogger(event)` / `useLogger()` / `createRequestLogger()` |
| Flat log data `{ uid, n, t }` | Grouped objects: `{ user: {...}, cart: {...} }` |
| Logging sensitive data `log.set({ user: body })` | Explicit fields: `{ user: { id: body.id, plan: body.plan } }` |

See [references/code-review.md](references/code-review.md) for the full checklist.

---

## Loading Reference Files

Load based on what you're working on — **do not load all at once**:

- Designing wide events → [references/wide-events.md](references/wide-events.md)
- Improving errors → [references/structured-errors.md](references/structured-errors.md)
- Full code review → [references/code-review.md](references/code-review.md)
- Drain pipeline setup → [references/drain-pipeline.md](references/drain-pipeline.md)
