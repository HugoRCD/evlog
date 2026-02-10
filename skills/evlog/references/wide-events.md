# Wide Events Guide

Wide events are comprehensive log entries that capture all context for a single logical operation (usually a request) in one place.

## Why Wide Events?

Traditional logging scatters information across many log lines:

```
10:23:45.001 Request received POST /checkout
10:23:45.012 User authenticated: user_123
10:23:45.045 Cart loaded: 3 items, $99.99
10:23:45.089 Payment initiated: Stripe
10:23:45.234 Payment failed: card_declined
10:23:45.235 Request completed: 500
```

During an incident, you're grep-ing through thousands of these trying to reconstruct what happened.

**Wide events emit once with everything:**

Development (pretty format):
```
10:23:45.235 ERROR [api] POST /checkout 500 in 234ms
  ├─ user: id=user_123 plan=premium accountAge=847
  ├─ cart: items=3 total=9999
  ├─ payment: provider=stripe method=card
  └─ error: code=card_declined retriable=false
```

Production (JSON format):
```json
{
  "timestamp": "2025-01-24T10:23:45.235Z",
  "level": "error",
  "service": "api",
  "method": "POST",
  "path": "/checkout",
  "duration": "234ms",
  "user": { "id": "user_123", "plan": "premium", "accountAge": 847 },
  "cart": { "items": 3, "total": 9999 },
  "payment": { "provider": "stripe", "method": "card" },
  "error": { "code": "card_declined", "retriable": false }
}
```

## When to Use Wide Events

| Scenario | Use Wide Event? |
|----------|----------------|
| HTTP request handling | Yes - one event per request |
| Background job execution | Yes - one event per job |
| Database query | No - use simple log |
| Cache hit/miss | No - include in parent wide event |
| User action (login, checkout) | Yes - one event per action |
| Debug statements | No - remove in production |

## Required Fields

Every wide event should include:

### Request Context

```typescript
log.set({
  method: 'POST',
  path: '/api/checkout',
  requestId: 'req_abc123',      // For tracing
  traceId: 'trace_xyz',         // Distributed tracing
})
```

### User Context

```typescript
log.set({
  user: {
    id: 'user_123',
    plan: 'premium',            // Business-relevant
    accountAge: 847,            // Days since signup
    subscription: 'annual',
  }
})
```

### Business Context

Add domain-specific data relevant to the operation:

```typescript
// E-commerce checkout
log.set({
  cart: { id: 'cart_xyz', items: 3, total: 9999 },
  payment: { method: 'card', provider: 'stripe' },
  order: { id: 'order_123', status: 'created' },
})

// API rate limiting
log.set({
  rateLimit: {
    limit: 1000,
    remaining: 42,
    resetAt: '2025-01-24T11:00:00Z',
  }
})

// File upload
log.set({
  upload: {
    filename: 'document.pdf',
    size: 1024000,
    mimeType: 'application/pdf',
  }
})
```

### Outcome

```typescript
// Success
log.set({
  status: 200,
  // duration is added automatically by emit()
})

// Error
log.error(error, {
  step: 'payment',
  retriable: false,
})
```

## Pattern: Request Logger in API Routes

### Nuxt/Nitro (Recommended)

With the evlog module, use `useLogger(event)` - it's auto-created and auto-emitted:

```typescript
// server/api/checkout.post.ts
import { useLogger, createError } from 'evlog'

export default defineEventHandler(async (event) => {
  const log = useLogger(event)  // Auto-created by evlog

  const user = await requireAuth(event)
  log.set({ user: { id: user.id, plan: user.plan } })

  const cart = await getCart(user.id)
  log.set({ cart: { items: cart.items.length, total: cart.total } })

  try {
    const payment = await processPayment(cart, user)
    log.set({ payment: { id: payment.id, method: payment.method } })
  } catch (error) {
    log.error(error, { step: 'payment' })
    throw createError({
      message: 'Payment failed',
      why: error.message,
      fix: 'Try a different payment method',
    })
  }

  const order = await createOrder(cart, user)
  log.set({ order: { id: order.id, status: order.status } })

  return order
  // log.emit() is called automatically at request end
})
```

### Standalone TypeScript (Scripts, Workers)

Without Nuxt/Nitro, use `createRequestLogger()` and call `emit()` manually:

```typescript
// scripts/sync-job.ts
import { initLogger, createRequestLogger } from 'evlog'

initLogger({ env: { service: 'sync-worker', environment: 'production' } })

async function processJob(job: Job) {
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
    log.emit()  // Manual emit required
  }
}
```

## Transformation Examples

### Before: Console.log Spam

```typescript
// server/api/checkout.post.ts

export default defineEventHandler(async (event) => {
  console.log('Checkout started')

  const user = await getUser(event)
  console.log('User loaded:', user.id)

  const cart = await getCart(user.id)
  console.log('Cart loaded:', cart.items.length, 'items')

  try {
    const payment = await processPayment(cart)
    console.log('Payment successful:', payment.id)
    return { orderId: payment.orderId }
  } catch (error) {
    console.error('Payment failed:', error.message)
    throw error
  }
})
```

### After: Single Wide Event

```typescript
// server/api/checkout.post.ts
import { useLogger, createError } from 'evlog'

export default defineEventHandler(async (event) => {
  const log = useLogger(event)

  const user = await getUser(event)
  log.set({ user: { id: user.id, plan: user.plan } })

  const cart = await getCart(user.id)
  log.set({ cart: { items: cart.items.length, total: cart.total } })

  try {
    const payment = await processPayment(cart)
    log.set({ payment: { id: payment.id }, order: { id: payment.orderId } })

    return { orderId: payment.orderId }
  } catch (error) {
    log.error(error, { step: 'payment' })
    throw createError({
      message: 'Payment failed',
      why: error.message,
      fix: 'Try a different payment method',
    })
  }
  // emit() called automatically
})
```

## Best Practices

### Do

- Include business-relevant context (user plan, cart value, etc.)
- Add enough context to debug without looking elsewhere
- Use consistent field names across your codebase
- Let `emit()` calculate duration automatically

### Don't

- Log sensitive data (passwords, tokens, full credit card numbers)
- Create multiple wide events for one logical operation
- Forget to call `emit()` (or use the Nuxt module for auto-emit)
- Include debugging logs inside wide events (remove them)

## Security: Preventing Sensitive Data Leakage

Wide events capture comprehensive context, making it easy to accidentally log sensitive data. Follow these guidelines to prevent data leakage.

### What NOT to Log

| Category | Examples | Risk |
|----------|----------|------|
| Credentials | Passwords, API keys, tokens, secrets | Account compromise |
| Payment data | Full card numbers, CVV, bank accounts | PCI compliance violation |
| Personal data (PII) | SSN, passport numbers, driver's license | Privacy laws (GDPR, CCPA) |
| Health data | Medical records, diagnoses | HIPAA violation |
| Authentication | Session tokens, JWTs, refresh tokens | Session hijacking |

### Safe Logging Pattern

Always explicitly select which fields to log:

```typescript
// ❌ DANGEROUS - logs everything including password
const body = await readBody(event)
log.set({ user: body })

// ✅ SAFE - explicitly select fields
const body = await readBody(event)
log.set({
  user: {
    id: body.id,
    email: maskEmail(body.email),
    // password: body.password ← NEVER include
  },
})
```

### Sanitization Helpers

Create utility functions for common data types:

```typescript
// server/utils/sanitize.ts

/** Masks email: john.doe@example.com → j***@e***.com */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return '***'
  const [domainName, tld] = domain.split('.')
  return `${local[0]}***@${domainName[0]}***.${tld}`
}

/** Masks card number: 4242424242424242 → ****4242 */
export function maskCard(card: string): string {
  return `****${card.slice(-4)}`
}

/** Removes sensitive fields from an object */
export function sanitize<T extends Record<string, unknown>>(
  obj: T,
  sensitiveKeys = ['password', 'token', 'secret', 'apiKey']
): Partial<T> {
  const result = { ...obj }
  for (const key of sensitiveKeys) {
    if (key in result) delete result[key]
  }
  return result
}
```

### Drain Hook Safety Net

As a last line of defense, filter before sending to external services:

```typescript
// server/plugins/evlog-sanitize.ts
const SENSITIVE_KEYS = ['password', 'token', 'secret', 'apiKey', 'authorization']

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:drain', (ctx) => {
    for (const key of Object.keys(ctx.event)) {
      if (SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k))) {
        ctx.event[key] = '[REDACTED]'
      }
    }
  })
})
```

### Production Checklist

Before deploying, verify:

- [ ] No passwords or secrets in logs
- [ ] No full credit card numbers (only last 4 digits)
- [ ] No API keys or tokens
- [ ] PII is masked or omitted (emails, phone numbers)
- [ ] Session tokens are not logged
- [ ] Request bodies are selectively logged (not `log.set({ body })`)

## Field Naming Conventions

Use consistent, descriptive field names:

```typescript
// ✅ Good - grouped, descriptive
log.set({
  user: { id, plan, accountAge },
  cart: { items, total },
  payment: { method, provider },
})

// ❌ Bad - flat, abbreviated
log.set({
  uid: '123',
  n: 3,
  t: 9999,
  pm: 'card',
})
```

## Inset: Nested Wide Events

By default, wide events are emitted as flat root-level JSON. The `inset` option wraps the entire wide event inside a named property (prefixed with `$`), which is useful when your observability platform injects its own metadata at the root level.

### Default Output (no inset)

```json
{
  "timestamp": "2026-01-24T10:23:45.235Z",
  "level": "info",
  "service": "api",
  "method": "POST",
  "path": "/checkout",
  "duration": "234ms",
  "user": { "id": "user_123", "plan": "premium" },
  "cart": { "items": 3, "total": 9999 }
}
```

### With Inset (`inset: 'evlog'`)

```json
{
  "$evlog": {
    "timestamp": "2026-01-24T10:23:45.235Z",
    "level": "info",
    "service": "api",
    "method": "POST",
    "path": "/checkout",
    "duration": "234ms",
    "user": { "id": "user_123", "plan": "premium" },
    "cart": { "items": 3, "total": 9999 }
  }
}
```

### Cloudflare Workers Observability Example

Cloudflare injects `$metadata` and `$workers` at the root level. With inset, your data stays cleanly separated:

```json
{
  "$evlog": {
    "timestamp": "2026-02-05T06:48:18.122Z",
    "level": "info",
    "service": "edge-api",
    "method": "POST",
    "path": "/api/checkout",
    "duration": "456ms",
    "user": { "id": "user_789", "plan": "enterprise" },
    "cart": { "items": 5, "total": 24999 },
    "checkout": { "step": "payment", "paymentMethod": "card" },
    "fraud": { "score": 12, "riskLevel": "low", "passed": true }
  },
  "$metadata": { "..." },
  "$workers": { "..." }
}
```

This makes it easy to query all your application data under a single namespace (e.g., `$evlog.user.plan` or `$evlog.cart.total`) without collision with platform fields.

### Configuration

```typescript
// Nuxt
export default defineNuxtConfig({
  modules: ['evlog/nuxt'],
  evlog: {
    inset: 'evlog',  // → logs nested under $evlog
  },
})

// Standalone
initLogger({
  env: { service: 'my-worker' },
  inset: 'data',  // → logs nested under $data
})
```

### Important Considerations

- **Pretty mode is unaffected.** Inset only applies to JSON output (`pretty: false`). Development pretty-print remains unchanged.
- **Property prefix.** The value is prefixed with `$` automatically: `inset: 'evlog'` → `$evlog`.
- **Platform compatibility.** Do not enable inset if your logging system expects fields like `level`, `requestId`, or `timestamp` at the root level (e.g., Axiom, Datadog, Grafana). Only use when the platform adds its own root-level metadata.
