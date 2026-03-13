---
name: create-evlog-framework-integration
description: Create a new evlog framework integration to add automatic wide-event logging to an HTTP framework. Use when adding middleware/plugin support for a framework (e.g., Hono, Elysia, Fastify, Express, NestJS) to the evlog package. Covers source code, build config, package exports, tests, example app, and all documentation.
---

# Create evlog Framework Integration

Add a new framework integration to evlog. Every integration follows the same architecture built on the shared `createMiddlewareLogger` utility. This skill walks through all touchpoints. **Every single touchpoint is mandatory** -- do not skip any.

## PR Title

Recommended format for the pull request title:

```
feat({framework}): add {Framework} middleware integration
```

## Touchpoints Checklist

| # | File | Action |
|---|------|--------|
| 1 | `packages/evlog/src/{framework}/index.ts` | Create integration source |
| 2 | `packages/evlog/tsdown.config.ts` | Add build entry + external |
| 3 | `packages/evlog/package.json` | Add `exports` + `typesVersions` + peer dep + keyword |
| 4 | `packages/evlog/test/{framework}.test.ts` | Create tests |
| 5 | `apps/docs/content/2.frameworks/{NN}.{framework}.md` | Create framework docs page |
| 6 | `apps/docs/content/2.frameworks/00.overview.md` | Add card + table row |
| 7 | `apps/docs/content/1.getting-started/2.installation.md` | Add card in "Choose Your Framework" |
| 8 | `apps/docs/content/0.landing.md` | Add framework code snippet |
| 9 | `apps/docs/app/components/features/FeatureFrameworks.vue` | Add framework tab |
| 10 | `skills/evlog/SKILL.md` | Add framework setup section + update frontmatter description |
| 11 | `packages/evlog/README.md` | Add framework section + add row to Framework Support table |
| 12 | `examples/{framework}/` | Create example app with test UI |
| 13 | `package.json` (root) | Add `example:{framework}` script |
| 14 | `.changeset/{framework}-integration.md` | Create changeset (`minor`) |
| 15 | `.github/workflows/semantic-pull-request.yml` | Add `{framework}` scope |
| 16 | `.github/pull_request_template.md` | Add `{framework}` scope |

**Important**: Do NOT consider the task complete until all 16 touchpoints have been addressed.

## Naming Conventions

Use these placeholders consistently:

| Placeholder | Example (Hono) | Usage |
|-------------|----------------|-------|
| `{framework}` | `hono` | Directory names, import paths, file names |
| `{Framework}` | `Hono` | PascalCase in type/interface names |

## Shared Utilities

All integrations share the same core utilities. **Never reimplement logic that exists in shared/**. These are also publicly available as `evlog/toolkit` for community-built integrations (see [Custom Integration docs](https://evlog.dev/frameworks/custom-integration)).

| Utility | Location | Purpose |
|---------|----------|---------|
| `createMiddlewareLogger` | `../shared/middleware` | Full lifecycle: logger creation, route filtering, tail sampling, emit, enrich, drain |
| `extractSafeHeaders` | `../shared/headers` | Convert Web API `Headers` → filtered `Record<string, string>` (Hono, Elysia, etc.) |
| `extractSafeNodeHeaders` | `../shared/headers` | Convert Node.js `IncomingHttpHeaders` → filtered `Record<string, string>` (Express, Fastify, NestJS) |
| `BaseEvlogOptions` | `../shared/middleware` | Base user-facing options type with `drain`, `enrich`, `keep`, `include`, `exclude`, `routes` |
| `MiddlewareLoggerOptions` | `../shared/middleware` | Internal options type extending `BaseEvlogOptions` with `method`, `path`, `requestId`, `headers` |
| `createLoggerStorage` | `../shared/storage` | Factory returning `{ storage, useLogger }` for `AsyncLocalStorage`-backed `useLogger()` |

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

The integration file should be **minimal** — typically 50-80 lines of framework-specific glue. All pipeline logic (enrich, drain, keep, header filtering) is handled by `createMiddlewareLogger`.

### Template Structure

```typescript
import type { RequestLogger } from '../types'
import { createMiddlewareLogger, type BaseEvlogOptions } from '../shared/middleware'
import { extractSafeHeaders } from '../shared/headers'       // for Web API Headers (Hono, Elysia)
// OR
import { extractSafeNodeHeaders } from '../shared/headers'    // for Node.js headers (Express, Fastify)
import { createLoggerStorage } from '../shared/storage'

const { storage, useLogger } = createLoggerStorage(
  'middleware context. Make sure the evlog middleware is registered before your routes.',
)

export interface Evlog{Framework}Options extends BaseEvlogOptions {}

export { useLogger }

// Type augmentation for typed logger access (framework-specific)
// For Express: declare module 'express-serve-static-core' { interface Request { log: RequestLogger } }
// For Hono: export type EvlogVariables = { Variables: { log: RequestLogger } }

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

    // Wrap next() in AsyncLocalStorage.run() for useLogger() support
    // Express: storage.run(logger, () => next())
    // Hono: await storage.run(logger, () => next())
  }
}
```

### Reference Implementations

- **Hono** (~40 lines): `packages/evlog/src/hono/index.ts` — Web API Headers, `c.set('log', logger)`, wraps `next()` in try/catch
- **Express** (~80 lines): `packages/evlog/src/express/index.ts` — Node.js headers, `req.log`, `res.on('finish')`, `AsyncLocalStorage` for `useLogger()`
- **Elysia** (~70 lines): `packages/evlog/src/elysia/index.ts` — Web API Headers, `derive()` plugin, `onAfterHandle`/`onError`, `AsyncLocalStorage` for `useLogger()`

### Key Architecture Rules

1. **Use `createMiddlewareLogger`** — never call `createRequestLogger` directly
2. **Use the right header extractor** — `extractSafeHeaders` for Web API `Headers`, `extractSafeNodeHeaders` for Node.js `IncomingHttpHeaders`
3. **Spread user options into `createMiddlewareLogger`** — `drain`, `enrich`, `keep` are handled automatically by `finish()`
4. **Store logger** in the framework's idiomatic context (e.g., `c.set()` for Hono, `req.log` for Express, `.derive()` for Elysia)
5. **Export `useLogger()`** — backed by `AsyncLocalStorage` so the logger is accessible from anywhere in the call stack
6. **Call `finish()`** in both success and error paths — it handles emit + enrich + drain
7. **Re-throw errors** after `finish()` so framework error handlers still work
8. **Export options interface** with drain/enrich/keep for feature parity across all frameworks
9. **Export type helpers** for typed context access (e.g., `EvlogVariables` for Hono)
10. **Framework SDK is a peer dependency** — never bundle it
11. **Never duplicate pipeline logic** — `callEnrichAndDrain` is internal to `createMiddlewareLogger`

### Framework-Specific Patterns

**Hono**: Use `MiddlewareHandler` return type, `c.set('log', logger)`, `c.res.status` for status, `c.req.raw.headers` for headers.

**Express**: Standard `(req, res, next)` middleware, `res.on('finish')` for response end, `storage.run(logger, () => next())` for `useLogger()`. Type augmentation targets `express-serve-static-core` (NOT `express`). Error handler uses `ErrorRequestHandler` type.

**Elysia**: Return `new Elysia({ name: 'evlog' })` plugin, use `.derive({ as: 'global' })` to create logger and attach `log` to context, `onAfterHandle` for success path, `onError` for error path. Use `storage.enterWith(logger)` in `derive` for `useLogger()` support. Note: `onAfterResponse` is fire-and-forget and may not complete before `app.handle()` returns in tests — use `onAfterHandle` instead.

**Fastify**: Use `fastify-plugin` wrapper, `fastify.decorateRequest('log', null)`, `onRequest`/`onResponse` hooks.

**NestJS**: `NestInterceptor` with `intercept()`, `tap()`/`catchError()` on observable, `forRoot()` dynamic module.

## Step 2: Build Config

Add a build entry in `packages/evlog/tsdown.config.ts`:

```typescript
'{framework}/index': 'src/{framework}/index.ts',
```

Place it after the existing framework entries (workers, next, hono, express).

Also add the framework SDK to the `external` array:

```typescript
external: [
  // ... existing externals
  '{framework-package}',  // e.g., 'elysia', 'fastify', 'express'
],
```

## Step 3: Package Exports

In `packages/evlog/package.json`, add four entries:

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

**In `keywords`** — add the framework name to the keywords array.

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
13. **useLogger() returns same logger** — verify `useLogger() === req.log` (or framework equivalent)
14. **useLogger() throws outside context** — verify error thrown when called without middleware
15. **useLogger() works across async** — verify logger accessible in async service functions

Use the framework's test utilities when available (e.g., Hono's `app.request()`, Express's `supertest`, Fastify's `inject()`).

## Step 5: Framework Docs Page

Create `apps/docs/content/2.frameworks/{NN}.{framework}.md` with a comprehensive, self-contained guide.

Use zero-padded numbering (`{NN}`) to maintain correct sidebar ordering. Check existing files to determine the next number.

**Frontmatter**:

```yaml
---
title: {Framework}
description: Using evlog with {Framework} — automatic wide events, structured errors, drain adapters, enrichers, and tail sampling in {Framework} applications.
navigation:
  title: {Framework}
  icon: i-simple-icons-{framework}
links:
  - label: Source Code
    icon: i-simple-icons-github
    to: https://github.com/HugoRCD/evlog/tree/main/examples/{framework}
    color: neutral
    variant: subtle
---
```

**Sections** (follow the Express/Hono/Elysia pages as reference):

1. **Quick Start** — install + register middleware (copy-paste minimum setup)
2. **Wide Events** — progressive `log.set()` usage
3. **useLogger()** — accessing logger from services without passing req
4. **Error Handling** — `createError()` + `parseError()` + framework error handler
5. **Drain & Enrichers** — middleware options with inline example
6. **Pipeline (Batching & Retry)** — `createDrainPipeline` example
7. **Tail Sampling** — `keep` callback
8. **Route Filtering** — `include` / `exclude` / `routes`
9. **Client-Side Logging** — browser drain (only if framework has a client-side story)
10. **Run Locally** — clone + `bun run example:{framework}`
11. **Card group** linking to GitHub source

## Step 6: Overview & Installation Cards

**In `apps/docs/content/2.frameworks/00.overview.md`**:

1. Add a row to the **Overview table** with framework name, import, type, logger access, and status
2. Add a `:::card` in the appropriate section (Full-Stack or Server Frameworks) with `color: neutral`

**In `apps/docs/content/1.getting-started/2.installation.md`**:

1. Add a `:::card` in the "Choose Your Framework" `::card-group` with `color: neutral`
2. Place it in the correct order relative to existing frameworks (Nuxt, Next.js, SvelteKit, Nitro, TanStack Start, NestJS, Express, Hono, Fastify, Elysia, CF Workers)

## Step 7: Landing Page (unchanged)

Add a code snippet in `apps/docs/content/0.landing.md` for the framework.

Find the `FeatureFrameworks` MDC component usage (the section with `#nuxt`, `#nextjs`, `#hono`, `#express`, etc.) and add a new slot:

```markdown
  #{framework}
  ```ts [src/index.ts]
  // Framework-specific code example showing evlog usage
  ```
```

Place the snippet in the correct order relative to existing frameworks.

## Step 8: FeatureFrameworks Component

Update `apps/docs/app/components/features/FeatureFrameworks.vue`:

1. Add the framework to the `frameworks` array with its icon and the **next available tab index**
2. Add a `<div v-show="activeTab === {N}">` with `<slot name="{framework}" />` in the template
3. **Increment tab indices** for any frameworks that come after the new one

Icons use Simple Icons format: `i-simple-icons-{name}` (e.g., `i-simple-icons-express`, `i-simple-icons-hono`).

## Step 9: Update `skills/evlog/SKILL.md`

In `skills/evlog/SKILL.md` (the public skill distributed to users):

1. Add `### {Framework}` in the **"Framework Setup"** section, after the last existing framework entry and before "Cloudflare Workers"
2. Include:
   - Import + `initLogger` + middleware/plugin setup
   - Logger access in route handlers (`req.log`, `c.get('log')`, or `{ log }` destructuring)
   - `useLogger()` snippet with a short service function example
   - Full pipeline example showing `drain`, `enrich`, and `keep` options
3. Update the `description:` line in the YAML frontmatter to mention the new framework name

## Step 10: Update `packages/evlog/README.md`

In the root `packages/evlog/README.md`:

1. Add a `## {Framework}` section after the Elysia section (before `## Browser`), with a minimal setup snippet and a link to the example app
2. Add a row to the **"Framework Support"** table:

```markdown
| **{Framework}** | `{registration pattern}` with `import { evlog } from 'evlog/{framework}'` ([example](./examples/{framework})) |
```

Keep the snippet short — just init, register/use middleware, and one route handler showing logger access. No need to repeat drain/enrich/keep here.

## Step 11: Example App

Create `examples/{framework}/` with a runnable app that demonstrates all evlog features.

The app must include:

1. **`evlog()` middleware** with `drain` (PostHog) and `enrich` callbacks
2. **Health route** — basic `log.set()` usage
3. **Data route** — context accumulation with user/business data, using `useLogger()` in a service function
4. **Error route** — `createError()` with status/why/fix/link
5. **Error handler** — framework's error handler with `parseError()` + manual `log.error()`
6. **Test UI** — served at `/`, a self-contained HTML page with buttons to hit each route and display JSON responses

**Drain must use PostHog** (`createPostHogDrain()` from `evlog/posthog`). The `POSTHOG_API_KEY` env var is already set in the root `.env`. This ensures every example tests a real external drain adapter.

Pretty printing should be enabled so the output is readable when testing locally.

**Type the `enrich` callback parameter explicitly** — use `type EnrichContext` from `evlog` to avoid implicit `any`:

```typescript
import { type EnrichContext } from 'evlog'

app.use(evlog({
  enrich: (ctx: EnrichContext) => {
    ctx.event.runtime = 'node'
  },
}))
```

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

## Step 12: Root Package Script

Add a root-level script in the monorepo `package.json`:

```json
"example:{framework}": "dotenv -- turbo run dev --filter=evlog-{framework}-example"
```

The `dotenv --` prefix loads the root `.env` file (containing `POSTHOG_API_KEY` and other adapter keys) into the process before turbo starts. Turborepo does not load `.env` files — `dotenv-cli` handles this at the root level so individual examples need no env configuration.

## Step 13: Changeset

Create `.changeset/{framework}-integration.md`:

```markdown
---
"evlog": minor
---

Add {Framework} middleware integration (`evlog/{framework}`) with automatic wide-event logging, drain, enrich, and tail sampling support
```

## Step 15 & 16: PR Scopes

Add the framework name as a valid scope in **both** files so PR title validation passes:

**`.github/workflows/semantic-pull-request.yml`** — add `{framework}` to the `scopes` list:

```yaml
scopes: |
  # ... existing scopes
  {framework}
```

**`.github/pull_request_template.md`** — add `{framework}` to the Scopes section:

```markdown
- {framework} ({Framework} integration)
```

## Verification

After completing all steps, run from the repo root:

```bash
cd packages/evlog
bun run build    # Verify build succeeds with new entry
bun run test     # Verify unit tests pass
bun run lint     # Verify no lint errors
```

Then type-check the example:

```bash
cd examples/{framework}
npx tsc --noEmit  # Verify no TS errors in the example
```
