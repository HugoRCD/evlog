---
name: create-evlog-adapter
description: Create a new built-in evlog adapter to send wide events to an external observability platform. Use when adding a new drain adapter (e.g., for Datadog, Sentry, Loki, Elasticsearch, etc.) to the evlog package. Covers source code, build config, package exports, tests, and all documentation.
---

# Create evlog Adapter

Add a new built-in adapter to evlog. Every adapter follows the same architecture and is built on the public toolkit primitives in `evlog/toolkit` — so a community adapter has the same shape as a built-in one.

## PR Title

Recommended format for the pull request title:

```
feat: add {name} adapter
```

The exact wording may vary depending on the adapter (e.g., `feat: add OTLP adapter`, `feat: add Axiom drain adapter`), but it should always follow the `feat:` conventional commit prefix.

## Touchpoints Checklist

| # | File | Action |
|---|------|--------|
| 1 | `packages/evlog/src/adapters/{name}.ts` | Create adapter source (built on `defineHttpDrain` from `../shared/drain`) |
| 2 | `packages/evlog/tsdown.config.ts` | Add build entry |
| 3 | `packages/evlog/package.json` | Add `exports` + `typesVersions` entries |
| 4 | `packages/evlog/test/adapters/{name}.test.ts` | Create tests |
| 5 | `apps/docs/content/4.adapters/{n}.{name}.md` | Create adapter doc page (before `custom.md`) |
| 6 | `apps/docs/content/4.adapters/1.overview.md` | Add adapter to overview (links, card, env vars) |
| 7 | `skills/review-logging-patterns/SKILL.md` | Add adapter row in the Drain Adapters table |
| 8 | Renumber `custom.md` | Ensure `custom.md` stays last after the new adapter |

**Important**: Do NOT consider the task complete until all 8 touchpoints have been addressed.

## Naming Conventions

Use these placeholders consistently:

| Placeholder | Example (Datadog) | Usage |
|-------------|-------------------|-------|
| `{name}` | `datadog` | File names, import paths, env var suffix |
| `{Name}` | `Datadog` | PascalCase in function/interface names |
| `{NAME}` | `DATADOG` | SCREAMING_CASE in env var prefixes |

Standard option naming (use these exact names):

| Concept | Standard option name |
|---------|---------------------|
| Bearer-style API secret | `apiKey` |
| Base URL of the ingest API | `endpoint` |
| Service identifier | `serviceName` |
| Request timeout (ms) | `timeout` |

If a service historically used a different name (`token`, `sourceToken`, …) keep it as a deprecated alias — see Axiom and Better Stack for the pattern.

## Step 1: Adapter Source — built on `defineHttpDrain`

Create `packages/evlog/src/adapters/{name}.ts`. Read [references/adapter-template.md](references/adapter-template.md) for the full annotated template.

The contract is now `defineHttpDrain<TConfig>({ resolve, encode })`. You only ship two pieces of logic:

1. **`resolve()`** — produce a fully-resolved config or `null` to skip. Use `resolveAdapterConfig` for the standard precedence (overrides → `runtimeConfig.evlog.{name}` → `runtimeConfig.{name}` → `NUXT_{NAME}_*` → `{NAME}_*`).
2. **`encode(events, config)`** — produce `{ url, headers, body }` for a batch of events (or `null` to skip). HTTP transport, retries, timeout, and error logging are handled by `defineHttpDrain`.

Key rules:

- **Single factory.** Export one `create{Name}Drain(overrides?: Partial<{Name}Config>)`. No dual-API factories: if a service has multiple ingest modes (logs vs events), expose them via a `mode` option (see PostHog).
- **No HTTP code in the adapter.** Don't call `fetch` directly — let `defineHttpDrain` do it. If your service truly needs custom transport (e.g. binary envelopes), use `defineDrain` and call `httpPost` from `evlog/toolkit`.
- **No bespoke config resolution.** Always go through `resolveAdapterConfig`. If you need to support a deprecated alias (`token` → `apiKey`), include both in the `ConfigField[]` and fall through in `resolve()`.
- **Exported converters.** If the service needs a specific event shape, export a `to{Name}Event()` (or `buildPayload()`) helper so it can be tested independently.

## Step 2: Build Config

Add a build entry in `packages/evlog/tsdown.config.ts` alongside the existing adapters:

```typescript
'adapters/{name}': 'src/adapters/{name}.ts',
```

Place it after the last adapter entry in `tsdown.config.ts` (follow existing ordering in that file).

## Step 3: Package Exports

In `packages/evlog/package.json`, add two entries:

**In `exports`** (after the last adapter, currently `./posthog`):

```json
"./{name}": {
  "types": "./dist/adapters/{name}.d.mts",
  "import": "./dist/adapters/{name}.mjs"
}
```

**In `typesVersions["*"]`** (after the last adapter):

```json
"{name}": [
  "./dist/adapters/{name}.d.mts"
]
```

## Step 4: Tests

Create `packages/evlog/test/adapters/{name}.test.ts`.

Read [references/test-template.md](references/test-template.md) for the full annotated template.

Required test categories:

1. URL construction (default + custom endpoint)
2. Headers (auth, content-type, service-specific)
3. Request body format (JSON structure matches service API)
4. Skip behavior when `apiKey` (or required field) is missing
5. Batch operations
6. Deprecated alias still works (when applicable)

## Step 5: Adapter Documentation Page

Create `apps/docs/content/4.adapters/{n}.{name}.md` where `{n}` is the next number before `custom.md` (custom should always be last).

Use the existing Axiom adapter page (`apps/docs/content/4.adapters/2.axiom.md`) as a reference for frontmatter structure, tone, and sections. Key sections: intro, quick setup, configuration (env vars table + priority), advanced usage, querying in the target service, troubleshooting, direct API usage, next steps.

**Important: multi-framework examples.** The Quick Start section must include a `::code-group` with tabs for all supported frameworks (Nuxt/Nitro, Hono, Express, Fastify, Elysia, NestJS, Standalone). Do not only show Nitro examples. See any existing adapter page for the pattern.

## Step 6: Update Adapters Overview Page

Edit `apps/docs/content/4.adapters/1.overview.md` to add the new adapter in **three** places (follow the pattern of existing adapters):

1. **Frontmatter `links` array** — add a link entry with icon and path
2. **`::card-group` section** — add a card block before the Custom card
3. **Zero-Config Setup `.env` example** — add the adapter's env vars

## Step 7: Update `skills/review-logging-patterns/SKILL.md`

In `skills/review-logging-patterns/SKILL.md` (the public skill distributed to users), find the **Drain Adapters** table and add a new row:

```markdown
| {Name} | `evlog/{name}` | `{NAME}_API_KEY`, `{NAME}_DATASET` (or equivalent) |
```

Follow the pattern of the existing rows (Axiom, OTLP, PostHog, Sentry, Better Stack).

## Step 8: Renumber `custom.md`

If the new adapter's number conflicts with `custom.md`, renumber `custom.md` to be the last entry. For example, if the new adapter is `5.{name}.md`, rename `5.custom.md` to `6.custom.md`.

## Verification

After completing all steps, run:

```bash
cd packages/evlog
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
```
