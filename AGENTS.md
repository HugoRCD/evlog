# evlog

A TypeScript logging library focused on **wide events** and structured error handling.

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

Use `initLogger()` once at startup, then `createRequestLogger()` for each logical operation.

```typescript
// scripts/sync-job.ts
import { initLogger, createRequestLogger } from 'evlog'

initLogger({
  env: { service: 'sync-worker', environment: 'production' },
})

const log = createRequestLogger({ jobId: job.id })
log.set({ source: job.source, target: job.target })
log.set({ recordsSynced: 150 })
log.emit() // Manual emit required
```

### Simple Logging (anywhere)

Use `log` for quick one-off logs. Auto-imported in Nuxt, manual import elsewhere.

```typescript
import { log } from 'evlog'

log.info('auth', 'User logged in')
log.error({ action: 'payment', error: 'card_declined' })
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

## Framework Integration

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
| `env.service` | `string` | `'app'` | Service name shown in logs |
| `env.environment` | `string` | Auto-detected | Environment name |
| `include` | `string[]` | `undefined` | Route patterns to log (glob). If not set, all routes are logged |
| `pretty` | `boolean` | `true` in dev | Pretty print logs with tree formatting |
| `sampling.rates` | `object` | `undefined` | Head sampling rates per log level (0-100%). Error defaults to 100% |
| `sampling.keep` | `array` | `undefined` | Tail sampling conditions to force-keep logs (see below) |

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

#### Log Draining

Use the `evlog:drain` hook to send logs to external services like Axiom, Loki, or custom endpoints.

```typescript
// server/plugins/evlog-axiom.ts
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:drain', async (ctx) => {
    await fetch('https://api.axiom.co/v1/datasets/logs/ingest', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.AXIOM_TOKEN}` },
      body: JSON.stringify([ctx.event])
    })
  })
})
```

The `DrainContext` contains:
- `event`: The complete `WideEvent` with all fields (timestamp, level, service, etc.)
- `request`: Optional request metadata (`method`, `path`, `requestId`)

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

### Nitro

```typescript
// nitro.config.ts or nuxt.config.ts
export default defineNuxtConfig({
  nitro: {
    plugins: ['evlog/nitro'],
  },
})
```

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
| `cause` | No | Original error (if wrapping)

**Best practice**: At minimum, provide `message` and `status`. Add `why` and `fix` for errors that users can act on. Add `link` for documented error codes.

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

Client logs output to the browser console with colored tags in development. Use for debugging and development - for production analytics, use dedicated services.

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
| `skills/evlog` | Review code for logging patterns, suggest evlog adoption, guide wide event design |

### Skill Structure

```
skills/
└── evlog/
    ├── SKILL.md              # Main skill instructions
    └── references/
        ├── wide-events.md    # Wide events patterns
        ├── structured-errors.md # Error handling guide
        └── code-review.md    # Review checklist
```

### Using Skills

Skills follow the [Agent Skills](https://agentskills.io/) specification. Compatible agents (Cursor, Claude Code, etc.) can discover and use these skills automatically.

To manually install with the skills CLI:

```bash
npx skills add hugorcd/evlog
```

## Credits

This library is inspired by [Logging Sucks](https://loggingsucks.com/) by [Boris Tane](https://x.com/boristane). The wide events philosophy and structured logging approach are adapted from his excellent work on making logging more useful.
