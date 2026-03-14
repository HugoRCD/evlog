---
name: review-logging-patterns
description: Review code for logging patterns and suggest evlog adoption. Guides setup on Nuxt, Next.js, SvelteKit, Nitro, TanStack Start, NestJS, Express, Hono, Fastify, Elysia, Cloudflare Workers, and standalone TypeScript. Detects console.log spam, unstructured errors, and missing context. Covers wide events, structured errors, drain adapters (Axiom, OTLP, PostHog, Sentry, Better Stack), sampling, and enrichers.
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

### SvelteKit

```typescript
// src/hooks.server.ts
import { initLogger } from 'evlog'
import { createEvlogHooks } from 'evlog/sveltekit'

initLogger({ env: { service: 'my-app' } })

export const { handle, handleError } = createEvlogHooks()
```

Access the logger via `event.locals.log` in route handlers or `useLogger()` from anywhere in the call stack:

```typescript
// src/routes/api/users/[id]/+server.ts
import { json } from '@sveltejs/kit'

export const GET = ({ locals, params }) => {
  locals.log.set({ user: { id: params.id } })
  return json({ id: params.id })
}
```

```typescript
import { useLogger } from 'evlog/sveltekit'

async function findUsers() {
  const log = useLogger()
  log.set({ db: { query: 'SELECT * FROM users' } })
}
```

Full pipeline with drain, enrich, and tail sampling:

```typescript
import { createAxiomDrain } from 'evlog/axiom'

export const { handle, handleError } = createEvlogHooks({
  include: ['/api/**'],
  drain: createAxiomDrain(),
  enrich: (ctx) => { ctx.event.region = process.env.FLY_REGION },
  keep: (ctx) => {
    if (ctx.duration && ctx.duration > 2000) ctx.shouldKeep = true
  },
})
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

### TanStack Start

TanStack Start uses Nitro v3. Install evlog and add a `nitro.config.ts`:

```typescript
// nitro.config.ts
import { defineConfig } from 'nitro'
import evlog from 'evlog/nitro/v3'

export default defineConfig({
  experimental: { asyncContext: true },
  modules: [evlog({ env: { service: 'my-app' } })],
})
```

Add the error handling middleware to `__root.tsx`:

```typescript
// src/routes/__root.tsx
import { createMiddleware } from '@tanstack/react-start'
import { evlogErrorHandler } from 'evlog/nitro/v3'

export const Route = createRootRoute({
  server: {
    middleware: [createMiddleware().server(evlogErrorHandler)],
  },
})
```

Use `useRequest()` from `nitro/context` to access the logger:

```typescript
import { useRequest } from 'nitro/context'
import type { RequestLogger } from 'evlog'

const req = useRequest()
const log = req.context.log as RequestLogger
log.set({ user: { id: 'user_123' } })
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

async function findUsers() {
  const log = useLogger()
  log.set({ db: { query: 'SELECT * FROM users' } })
}
```

Full pipeline with drain, enrich, and tail sampling:

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

For async configuration with NestJS DI, use `forRootAsync()`:

```typescript
EvlogModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config) => ({
    drain: createAxiomDrain({ token: config.get('AXIOM_TOKEN') }),
  }),
})
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

async function findUsers() {
  const log = useLogger()
  log.set({ db: { query: 'SELECT * FROM users' } })
}
```

Full pipeline with drain, enrich, and tail sampling:

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

Access the logger via `c.get('log')` in handlers. No `useLogger()` — use `c.get('log')` and pass it down explicitly, or use Express/Fastify/Elysia if you need `useLogger()` across async boundaries.

Full pipeline with drain, enrich, and tail sampling:

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

const app = Fastify({ logger: false })
await app.register(evlog)

app.get('/api/users', async (request) => {
  request.log.set({ users: { count: 42 } })
  return { users: [] }
})
```

`request.log` is the evlog wide-event logger (shadows Fastify's built-in pino logger on the request). Fastify's pino logger remains accessible via `fastify.log`.

Use `useLogger()` to access the logger from anywhere in the call stack without passing `request`:

```typescript
import { useLogger } from 'evlog/fastify'

async function findUsers() {
  const log = useLogger()
  log.set({ db: { query: 'SELECT * FROM users' } })
}
```

Full pipeline with drain, enrich, and tail sampling:

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

async function findUsers() {
  const log = useLogger()
  log.set({ db: { query: 'SELECT * FROM users' } })
}
```

Full pipeline with drain, enrich, and tail sampling:

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
| `silent` | `boolean` | `false` | Suppress console output. Events still go to drains |
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
| Axiom | `evlog/axiom` | `AXIOM_TOKEN`, `AXIOM_DATASET` |
| OTLP | `evlog/otlp` | `OTLP_ENDPOINT` (or `OTEL_EXPORTER_OTLP_ENDPOINT`) |
| PostHog | `evlog/posthog` | `POSTHOG_API_KEY`, `POSTHOG_HOST` |
| Sentry | `evlog/sentry` | `SENTRY_DSN` |
| Better Stack | `evlog/better-stack` | `BETTER_STACK_SOURCE_TOKEN` |
| File System | `evlog/fs` | None (local file system) |

In Nuxt/Nitro, use the `NUXT_` prefix (e.g., `NUXT_AXIOM_TOKEN`) so values are available via `useRuntimeConfig()`. All adapters also read unprefixed variables as fallback.

Setup pattern per framework:

```typescript
// Nuxt/Nitro: server/plugins/evlog-drain.ts
import { createAxiomDrain } from 'evlog/axiom'
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:drain', createAxiomDrain())
})

// Hono / Express / Elysia: pass drain in middleware options
import { createAxiomDrain } from 'evlog/axiom'
app.use(evlog({ drain: createAxiomDrain() }))

// Fastify: pass drain in plugin options
import { createAxiomDrain } from 'evlog/axiom'
await app.register(evlog, { drain: createAxiomDrain() })

// NestJS: pass drain in module options
import { createAxiomDrain } from 'evlog/axiom'
EvlogModule.forRoot({ drain: createAxiomDrain() })

// Next.js: pass drain to createEvlog()
import { createAxiomDrain } from 'evlog/axiom'
import { createDrainPipeline } from 'evlog/pipeline'
const pipeline = createDrainPipeline<DrainContext>({ batch: { size: 50 } })
const drain = pipeline(createAxiomDrain())
// then: createEvlog({ ..., drain })

// Standalone: pass drain to initLogger()
initLogger({ env: { service: 'my-app' }, drain: createAxiomDrain() })
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
