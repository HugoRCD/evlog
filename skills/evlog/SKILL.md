---
name: review-logging-patterns
description: Review code for logging patterns and suggest evlog adoption. Detects console.log spam, unstructured errors, and missing context. Guides wide event design, structured error handling, request-scoped logging, and log draining with adapters (Axiom, OTLP).
license: MIT
metadata:
  author: HugoRCD
  version: "0.3"
---

# Review logging patterns

Review and improve logging patterns in TypeScript/JavaScript codebases. Transform scattered console.logs into structured wide events and convert generic errors into self-documenting structured errors.

## When to Use

**Use this skill when:**

- Reviewing code for logging best practices
- User asks to improve their logging
- Converting console.log statements to structured logging
- Improving error handling with better context
- Setting up request-scoped logging in API routes
- Debugging why logs are hard to search/filter

**Key transformations:**

- `console.log` spam → wide events with `useLogger(event)`
- `throw new Error('...')` → `createError({ message, status, why, fix })`
- Scattered request logs → `useLogger(event)` (Nuxt/Nitro) or `createRequestLogger()` (standalone)

## Quick Reference

| Working on...           | Resource                                                           |
| ----------------------- | ------------------------------------------------------------------ |
| Wide events patterns    | [references/wide-events.md](references/wide-events.md)             |
| Error handling          | [references/structured-errors.md](references/structured-errors.md) |
| Code review checklist   | [references/code-review.md](references/code-review.md)             |
| Log draining & adapters | See "Log Draining & Adapters" section below                        |

## Important: Auto-imports in Nuxt

In Nuxt applications, all evlog functions are **auto-imported** - no import statements needed:

```typescript
// server/api/checkout.post.ts
export default defineEventHandler(async (event) => {
  // useLogger is auto-imported - no import needed!
  const log = useLogger(event)
  log.set({ user: { id: 1, plan: 'pro' } })
  return { success: true }
})
```

```vue
<!-- In Vue components - log is auto-imported -->
<script setup>
log.info('checkout', 'User initiated checkout')
</script>
```

## Core Philosophy

### The Problem with Traditional Logging

```typescript
// ❌ Scattered logs - impossible to correlate during incidents
console.log('Request received')
console.log('User authenticated')
console.log('Loading cart')
console.log('Processing payment')
console.log('Payment failed')
```

### The Solution: Wide Events

```typescript
// server/api/checkout.post.ts
// No import needed in Nuxt - useLogger is auto-imported!

// ✅ One comprehensive event per request
export default defineEventHandler(async (event) => {
  const log = useLogger(event)

  log.set({ user: { id: '123', plan: 'premium' } })
  log.set({ cart: { items: 3, total: 9999 } })
  log.error(error, { step: 'payment' })

  // emit() called automatically at request end
})
```

## Anti-Patterns to Detect

### 1. Console.log Spam

```typescript
// ❌ Multiple logs for one logical operation
console.log('Starting checkout')
console.log('User:', userId)
console.log('Cart:', cart)
console.log('Payment result:', result)
```

**Transform to:**

```typescript
// ✅ Single wide event
log.info({
  action: 'checkout',
  userId,
  cart,
  result,
  duration: '1.2s'
})
```

### 2. Generic Error Messages

```typescript
// ❌ Useless error
throw new Error('Something went wrong')

// ❌ Missing context
throw new Error('Payment failed')
```

**Transform to:**

```typescript
import { createError } from 'evlog'

// ✅ Self-documenting error
throw createError({
  message: 'Payment failed',
  status: 402,
  why: 'Card declined by issuer',
  fix: 'Try a different payment method or contact your bank',
  link: 'https://docs.example.com/payments/declined',
  cause: originalError,
})
```

### 3. Missing Request Context

```typescript
// server/api/orders.post.ts

// ❌ No way to correlate logs
export default defineEventHandler(async (event) => {
  console.log('Processing request')
  const user = await getUser(event)
  console.log('Got user', user.id)
  // ...
})
```

**Transform to (Nuxt/Nitro):**

```typescript
// server/api/orders.post.ts
// useLogger is auto-imported in Nuxt - no import needed!

// ✅ Request-scoped with full context
export default defineEventHandler(async (event) => {
  const log = useLogger(event)

  const user = await getUser(event)
  log.set({ user: { id: user.id, plan: user.plan } })

  // ... do work, accumulate context ...

  // emit() called automatically
})
```

**Transform to (Standalone TypeScript):**

```typescript
// scripts/process-job.ts
import { createRequestLogger } from 'evlog'

const log = createRequestLogger({ jobId: job.id, type: 'sync' })

log.set({ source: job.source, target: job.target })
// ... do work ...
log.emit()  // Manual emit for standalone usage
```

## Installation

```bash
npm install evlog
```

### Nuxt Integration

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['evlog/nuxt'],
  evlog: {
    env: {
      service: 'my-app',
      environment: process.env.NODE_ENV,
    },
    // Optional: only log specific routes (supports glob patterns)
    include: ['/api/**'],
    // Optional: send client logs to server (default: false)
    transport: {
      enabled: true,
    },
  },
})
```

### Nitro Integration

```typescript
// nitro.config.ts
export default defineNitroConfig({
  plugins: ['evlog/nitro'],
})
```

## Structured Error Levels

Not all errors need the same level of detail. Use the appropriate level:

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

## Frontend Integration

evlog errors work with any Nitro-powered framework. When thrown, they're automatically converted to HTTP responses with structured data.

Use `parseError()` to extract all fields at the top level:

```typescript
import { createError, parseError } from 'evlog'

// Backend - just throw the error
throw createError({
  message: 'Payment failed',
  status: 402,
  why: 'Card declined',
  fix: 'Try another card',
  link: 'https://docs.example.com/payments',
})

// Frontend - use parseError() for direct access
try {
  await $fetch('/api/checkout')
} catch (err) {
  const error = parseError(err)

  // Direct access: error.message, error.why, error.fix, error.link
  toast.add({
    title: error.message,
    description: error.why,
    color: 'error',
    actions: error.link
      ? [{ label: 'Learn more', onClick: () => window.open(error.link) }]
      : undefined,
  })

  if (error.fix) console.info(`💡 Fix: ${error.fix}`)
}
```

**The difference**: A generic error shows "An error occurred". A structured error shows the message, explains why, suggests a fix, and links to docs.

## Client-Side Logging

The `log` API works on both server and client. In Nuxt, it's auto-imported:

```typescript
// In Vue components, composables, or client-side code
log.info('checkout', 'User initiated checkout')
log.error({ action: 'payment', error: 'validation_failed' })
log.warn('form', 'Invalid email format')
log.debug({ component: 'CartDrawer', itemCount: 3 })
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

Identify client logs in your drain hook:

```typescript
nitroApp.hooks.hook('evlog:drain', async (ctx) => {
  if (ctx.event.source === 'client') {
    // Handle client logs specifically
  }
})
```

## Log Draining & Adapters

evlog provides built-in adapters to send logs to external observability platforms.

### Built-in Adapters

| Adapter | Import | Use Case |
|---------|--------|----------|
| Axiom | `evlog/axiom` | Axiom datasets for querying and dashboards |
| OTLP | `evlog/otlp` | OpenTelemetry for Grafana, Datadog, Honeycomb, etc. |

### Quick Setup

**Axiom:**

```typescript
// server/plugins/evlog-drain.ts
import { createAxiomDrain } from 'evlog/axiom'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:drain', createAxiomDrain())
})
```

Set `NUXT_AXIOM_TOKEN` and `NUXT_AXIOM_DATASET` environment variables.

**OTLP:**

```typescript
// server/plugins/evlog-drain.ts
import { createOTLPDrain } from 'evlog/otlp'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:drain', createOTLPDrain())
})
```

Set `NUXT_OTLP_ENDPOINT` environment variable.

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
    // ctx.event contains the full wide event
    await fetch('https://your-service.com/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ctx.event),
    })
  })
})
```

## Security: Preventing Sensitive Data Leakage

Wide events capture comprehensive context, making it easy to accidentally log sensitive data.

### What NOT to Log

| Category | Examples | Risk |
|----------|----------|------|
| Credentials | Passwords, API keys, tokens | Account compromise |
| Payment data | Full card numbers, CVV | PCI violation |
| Personal data (PII) | SSN, unmasked emails | GDPR/CCPA violation |
| Authentication | Session tokens, JWTs | Session hijacking |

### Safe Logging Pattern

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

### Sanitization Helpers

```typescript
// server/utils/sanitize.ts
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  return `${local[0]}***@${domain}`
}

export function maskCard(card: string): string {
  return `****${card.slice(-4)}`
}
```

## Review Checklist

When reviewing code, check for:

1. **Console.log statements** → Replace with `useLogger(event).set()` or wide events
2. **Generic errors** → Add `status`, `why`, `fix`, and `link` fields with `createError()`
3. **Scattered request logs** → Use `useLogger(event)` (Nuxt/Nitro) or `createRequestLogger()` (standalone)
4. **Missing context** → Add user, business, and outcome context with `log.set()`
5. **No duration tracking** → Let `emit()` handle it automatically
6. **No frontend error handling** → Catch errors and display toasts with structured data
7. **Sensitive data in logs** → Check for passwords, tokens, full card numbers, PII
8. **Client-side logging** → Use `log` API for debugging in Vue components
9. **Client log centralization** → Enable `transport.enabled: true` to send client logs to server
10. **Missing log draining** → Set up adapters (`evlog/axiom`, `evlog/otlp`) for production log export

## Loading Reference Files

Load reference files based on what you're working on:

- Designing wide events → [references/wide-events.md](references/wide-events.md)
- Improving errors → [references/structured-errors.md](references/structured-errors.md)
- Full code review → [references/code-review.md](references/code-review.md)

**DO NOT load all files at once** - load only what's needed for the current task.
