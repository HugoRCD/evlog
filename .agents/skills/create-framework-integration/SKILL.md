---
name: create-evlog-framework-integration
description: Create a new evlog framework integration to add automatic wide-event logging to an HTTP framework. Use when adding middleware/plugin support for a framework (e.g., Hono, Elysia, Fastify, Express, NestJS) to the evlog package. Covers source code, build config, package exports, tests, example app, and all documentation.
---

# Create evlog Framework Integration

Add a new framework integration to evlog. Every integration follows the same architecture built on the shared `createMiddlewareLogger` utility. This skill walks through all 7 touchpoints. **Every single touchpoint is mandatory** -- do not skip any.

## PR Title

Recommended format for the pull request title:

```
feat: add {framework} integration
```

The exact wording may vary depending on the framework (e.g., `feat: add Hono middleware`, `feat: add Elysia plugin`), but it should always follow the `feat:` conventional commit prefix.

## Touchpoints Checklist

| # | File | Action |
|---|------|--------|
| 1 | `packages/evlog/src/{framework}/index.ts` | Create integration source |
| 2 | `packages/evlog/tsdown.config.ts` | Add build entry |
| 3 | `packages/evlog/package.json` | Add `exports` + `typesVersions` + peer dep |
| 4 | `packages/evlog/test/{framework}.test.ts` | Create tests |
| 5 | `apps/docs/content/1.getting-started/2.installation.md` | Add framework docs section |
| 6 | `AGENTS.md` | Add framework to the integration section |
| 7 | `examples/{framework}/` | Create minimal example app |

**Important**: Do NOT consider the task complete until all 7 touchpoints have been addressed.

## Naming Conventions

Use these placeholders consistently:

| Placeholder | Example (Hono) | Usage |
|-------------|----------------|-------|
| `{framework}` | `hono` | Directory names, import paths, file names |
| `{Framework}` | `Hono` | PascalCase in type/interface names |

## Shared Utilities

All integrations share the same core utilities. **Never reimplement logic that exists in shared/**.

| Utility | Location | Purpose |
|---------|----------|---------|
| `createMiddlewareLogger` | `../shared/middleware` | Full lifecycle: logger creation, route filtering, tail sampling, emit, enrich, drain |
| `extractSafeHeaders` | `../shared/headers` | Convert Web API `Headers` → filtered `Record<string, string>` (sensitive headers removed) |
| `MiddlewareLoggerOptions` | `../shared/middleware` | Base options type with `drain`, `enrich`, `keep`, `include`, `exclude`, `routes`, `headers` |

### Test Helpers

| Utility | Location | Purpose |
|---------|----------|---------|
| `createPipelineSpies()` | `test/helpers/framework` | Creates mock drain/enrich/keep callbacks |
| `assertDrainCalledWith()` | `test/helpers/framework` | Validates drain was called with expected event shape |
| `assertEnrichBeforeDrain()` | `test/helpers/framework` | Validates enrich runs before drain |
| `assertSensitiveHeadersFiltered()` | `test/helpers/framework` | Validates sensitive headers are excluded |
| `assertWideEventShape()` | `test/helpers/framework` | Validates standard wide event fields |

## Step 1: Integration Source

Create `packages/evlog/src/{framework}/index.ts`.

The integration file should be **minimal** — typically 30-50 lines of framework-specific glue. All pipeline logic (enrich, drain, keep, header filtering) is handled by `createMiddlewareLogger`.

### Template Structure

```typescript
import type { MiddlewareHandler } from '{framework}'
import type { DrainContext, EnrichContext, RequestLogger, RouteConfig, TailSamplingContext } from '../types'
import { createMiddlewareLogger } from '../shared/middleware'
import { extractSafeHeaders } from '../shared/headers'

export interface Evlog{Framework}Options {
  include?: string[]
  exclude?: string[]
  routes?: Record<string, RouteConfig>
  drain?: (ctx: DrainContext) => void | Promise<void>
  enrich?: (ctx: EnrichContext) => void | Promise<void>
  keep?: (ctx: TailSamplingContext) => void | Promise<void>
}

export type EvlogVariables = { Variables: { log: RequestLogger } }

export function evlog(options: Evlog{Framework}Options = {}): FrameworkMiddleware {
  return async (frameworkContext, next) => {
    const { logger, finish, skipped } = createMiddlewareLogger({
      method: /* extract from framework context */,
      path: /* extract from framework context */,
      requestId: /* extract x-request-id or crypto.randomUUID() */,
      headers: extractSafeHeaders(/* framework request Headers object */),
      ...options,
    })

    if (skipped) {
      await next()
      return
    }

    // Store logger in framework-specific context
    // e.g., c.set('log', logger) for Hono
    // e.g., req.log = logger for Express
    // e.g., .derive() for Elysia

    try {
      await next()
      await finish({ status: /* extract response status */ })
    } catch (error) {
      await finish({ error: error as Error })
      throw error
    }
  }
}
```

### Reference Implementation (Hono — 40 lines)

See `packages/evlog/src/hono/index.ts` for the canonical example. The entire Hono integration is ~40 lines because all shared logic lives in `createMiddlewareLogger`.

### Key Architecture Rules

1. **Use `createMiddlewareLogger`** — never call `createRequestLogger` directly
2. **Use `extractSafeHeaders`** from `../shared/headers` — never reimplement header extraction
3. **Spread user options into `createMiddlewareLogger`** — `drain`, `enrich`, `keep` are handled automatically by `finish()`
4. **Store logger** in the framework's idiomatic context (e.g., `c.set()` for Hono, `req.log` for Express, `.derive()` for Elysia)
5. **Call `finish()`** in both success and error paths — it handles emit + enrich + drain
6. **Re-throw errors** after `finish()` so framework error handlers still work
7. **Export options interface** with drain/enrich/keep for feature parity across all frameworks
8. **Export type helpers** for typed context access (e.g., `EvlogVariables` for Hono)
9. **Framework SDK is a peer dependency** — never bundle it
10. **Never duplicate pipeline logic** — `callEnrichAndDrain` is internal to `createMiddlewareLogger`

### Framework-Specific Patterns

**Hono**: Use `MiddlewareHandler` return type, `c.set('log', logger)`, `c.res.status` for status, `c.req.raw.headers` for headers.

**Elysia**: Return `new Elysia({ name: 'evlog' })` plugin, use `.derive()` to attach `log` to context, `onAfterResponse` for emit.

**Fastify**: Use `fastify-plugin` wrapper, `fastify.decorateRequest('log', null)`, `onRequest`/`onResponse` hooks.

**Express**: Standard `(req, res, next)` middleware, `res.on('finish')` for response end, `declare module 'express'` for type augmentation.

**NestJS**: `NestInterceptor` with `intercept()`, `tap()`/`catchError()` on observable, `forRoot()` dynamic module.

## Step 2: Build Config

Add a build entry in `packages/evlog/tsdown.config.ts`:

```typescript
'{framework}/index': 'src/{framework}/index.ts',
```

Place it after the existing framework entries (workers, next, hono).

Also add the framework SDK to the `external` array:

```typescript
external: [
  // ... existing externals
  '{framework-package}',  // e.g., 'elysia', 'fastify', 'express'
],
```

## Step 3: Package Exports

In `packages/evlog/package.json`, add three entries:

**In `exports`** (after the last framework entry):

```json
"./{framework}": {
  "types": "./dist/{framework}/index.d.mts",
  "import": "./dist/{framework}/index.mjs"
}
```

**In `typesVersions["*"]`**:

```json
"{framework}": [
  "./dist/{framework}/index.d.mts"
]
```

**In `peerDependencies`** (with version range):

```json
"{framework-package}": "^{latest-major}.0.0"
```

**In `peerDependenciesMeta`** (mark as optional):

```json
"{framework-package}": {
  "optional": true
}
```

## Step 4: Tests

Create `packages/evlog/test/{framework}.test.ts`.

**Import shared test helpers** from `./helpers/framework`:

```typescript
import {
  assertDrainCalledWith,
  assertEnrichBeforeDrain,
  assertSensitiveHeadersFiltered,
  createPipelineSpies,
} from './helpers/framework'
```

Required test categories:

1. **Middleware creates logger** — verify `c.get('log')` or `req.log` returns a `RequestLogger`
2. **Auto-emit on response** — verify event includes status, method, path, duration
3. **Error handling** — verify errors are captured and event has error level + error details
4. **Route filtering** — verify skipped routes don't create a logger
5. **Request ID forwarding** — verify `x-request-id` header is used when present
6. **Context accumulation** — verify `logger.set()` data appears in emitted event
7. **Drain callback** — use `assertDrainCalledWith()` helper
8. **Enrich callback** — use `assertEnrichBeforeDrain()` helper
9. **Keep callback** — verify tail sampling callback receives context and can force-keep logs
10. **Sensitive header filtering** — use `assertSensitiveHeadersFiltered()` helper
11. **Drain/enrich error resilience** — verify errors in drain/enrich do not break the request
12. **Skipped routes skip drain/enrich** — verify drain/enrich are not called for excluded routes

Use the framework's test utilities when available (e.g., Hono's `app.request()`, Fastify's `inject()`). If not available, mock the framework context.

## Step 5: Documentation

Add a section in `apps/docs/content/1.getting-started/2.installation.md` for the framework.

Follow the pattern of existing framework sections (Nuxt, Next.js, Nitro, Hono). Include:

1. **Setup code** — minimal working example with imports and configuration
2. **Usage in routes** — how to access the logger in route handlers
3. **Error handling** — how structured errors work with the framework
4. **Full pipeline example** — show drain + enrich + keep configuration (feature parity)

## Step 6: Update AGENTS.md

In the root `AGENTS.md` file:

1. Add the framework to the **"Framework Integration"** section
2. Add import path and setup example
3. Show drain/enrich/keep usage

## Step 7: Example App

Create `examples/{framework}/` with a runnable app that demonstrates all evlog features.

The app must include:

1. **`evlog()` middleware** with `drain` (PostHog) and `enrich` callbacks
2. **Health route** — basic `log.set()` usage
3. **Data route** — context accumulation with user/business data
4. **Error route** — `createError()` with status/why/fix/link
5. **Error handler** — framework's error handler with `parseError()` + manual `log.error()`
6. **Test UI** — served at `/`, a self-contained HTML page with buttons to hit each route and display JSON responses

**Drain must use PostHog** (`createPostHogDrain()` from `evlog/posthog`). The `POSTHOG_API_KEY` env var is already set in the root `.env`. This ensures every example tests a real external drain adapter.

Pretty printing should be enabled so the output is readable when testing locally.

### Test UI

Every example must serve a test UI at `GET /` — a self-contained HTML page (no external deps) that lets the user click routes and see responses without curl.

The UI must:
- List all available routes with method badge + path + description
- Send the request on click and display the JSON response with syntax highlighting
- Show status code (color-coded 2xx/4xx/5xx) and response time
- Use a dark theme with monospace font
- Be a single `.ts` file (`src/ui.ts`) exporting a `testUI()` function returning an HTML string
- The root `/` route must be registered **before** the evlog middleware so it doesn't get logged

Reference: `examples/hono/src/ui.ts` for the canonical pattern. Copy and adapt for each framework.

### Required files

| File | Purpose |
|------|---------|
| `src/index.ts` | App with all features demonstrated |
| `src/ui.ts` | Test UI — `testUI()` returning self-contained HTML |
| `package.json` | `dev` and `start` scripts |
| `tsconfig.json` | TypeScript config (if needed) |
| `README.md` | How to run + link to the UI |

### Package scripts

```json
{
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "start": "bun src/index.ts"
  }
}
```

Also add a root-level script in the monorepo `package.json`:

```json
"example:{framework}": "dotenv -- turbo run dev --filter=evlog-{framework}-example"
```

The `dotenv --` prefix loads the root `.env` file (containing `POSTHOG_API_KEY` and other adapter keys) into the process before turbo starts. Turborepo does not load `.env` files — `dotenv-cli` handles this at the root level so individual examples need no env configuration.

## Verification

After completing all steps, run from the repo root:

```bash
cd packages/evlog
bun run build    # Verify build succeeds with new entry
bun run test     # Verify unit tests pass
```
