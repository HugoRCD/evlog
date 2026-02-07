---
name: create-evlog-adapter
description: Create a new built-in evlog adapter to send wide events to an external observability platform. Use when adding a new drain adapter (e.g., for Datadog, Sentry, Loki, Elasticsearch, etc.) to the evlog package. Covers source code, build config, package exports, tests, and documentation.
---

# Create evlog Adapter

Add a new built-in adapter to evlog. Every adapter follows the same architecture. This skill walks through all 5 touchpoints.

## Touchpoints Checklist

| # | File | Action |
|---|------|--------|
| 1 | `packages/evlog/src/adapters/{name}.ts` | Create adapter source |
| 2 | `packages/evlog/build.config.ts` | Add build entry |
| 3 | `packages/evlog/package.json` | Add `exports` + `typesVersions` entries |
| 4 | `packages/evlog/test/adapters/{name}.test.ts` | Create tests |
| 5 | `apps/docs/content/3.adapters/{n}.{name}.md` | Create doc page (before `custom.md`) |

After all 5 steps, update `AGENTS.md` to list the new adapter in the adapters table.

## Naming Conventions

Use these placeholders consistently:

| Placeholder | Example (Datadog) | Usage |
|-------------|-------------------|-------|
| `{name}` | `datadog` | File names, import paths, env var suffix |
| `{Name}` | `Datadog` | PascalCase in function/interface names |
| `{NAME}` | `DATADOG` | SCREAMING_CASE in env var prefixes |

## Step 1: Adapter Source

Create `packages/evlog/src/adapters/{name}.ts`.

Read [references/adapter-template.md](references/adapter-template.md) for the full annotated template.

Key architecture rules:

1. **Config interface** -- service-specific fields (API key, endpoint, etc.) plus optional `timeout?: number`
2. **`getRuntimeConfig()` helper** -- dynamic `require('nitropack/runtime')` wrapped in try/catch
3. **Config priority** (highest to lowest):
   - Overrides passed to `create{Name}Drain()`
   - `runtimeConfig.evlog.{name}`
   - `runtimeConfig.{name}`
   - Environment variables: `NUXT_{NAME}_*` then `{NAME}_*`
4. **Factory function** -- `create{Name}Drain(overrides?: Partial<Config>)` returns `(ctx: DrainContext) => Promise<void>`
5. **Exported send functions** -- `sendTo{Name}(event, config)` and `sendBatchTo{Name}(events, config)` for direct use and testability
6. **Error handling** -- try/catch with `console.error('[evlog/{name}] ...')`, never throw from the drain
7. **Timeout** -- `AbortController` with 5000ms default, configurable via `config.timeout`
8. **Event transformation** -- if the service needs a specific format, export a `to{Name}Event()` converter

## Step 2: Build Config

Add a build entry in `packages/evlog/build.config.ts` alongside the existing adapters:

```typescript
{ input: 'src/adapters/{name}', name: 'adapters/{name}' },
```

Place it after the last adapter entry (currently `posthog` at line ~21).

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
4. Error handling (non-OK responses throw with status)
5. Batch operations (`sendBatchTo{Name}`)
6. Timeout handling (default 5000ms + custom)

## Step 5: Documentation

Create `apps/docs/content/3.adapters/{n}.{name}.md` where `{n}` is the next number before `custom.md` (custom should always be last).

Use this frontmatter structure:

```yaml
---
title: "{Name} Adapter"
description: "Send logs to {Name} for [value prop]. Zero-config setup with environment variables."
navigation:
  title: "{Name}"
  icon: i-simple-icons-{name}  # or i-lucide-* for generic
links:
  - label: "{Name} Dashboard"
    icon: i-lucide-external-link
    to: https://{service-url}
    target: _blank
    color: neutral
    variant: subtle
  - label: "OTLP Adapter"
    icon: i-simple-icons-opentelemetry
    to: /adapters/otlp
    color: neutral
    variant: subtle
---
```

Sections to include:

1. **Intro paragraph** -- what the service is and what the adapter does
2. **Installation** -- import path `evlog/{name}`
3. **Quick Setup** -- Nitro plugin with `create{Name}Drain()`
4. **Configuration** -- table of env vars and config options
5. **Configuration Priority** -- overrides > runtimeConfig > env vars
6. **Advanced** -- custom options, event transformation details
7. **Querying/Using** -- how to find evlog events in the target service

Renumber `custom.md` if needed so it stays last.

## Final Step: Update AGENTS.md

Add the new adapter to the adapters table in the root `AGENTS.md` file, in the "Log Draining & Adapters" section:

```markdown
| {Name} | `evlog/{name}` | Send logs to {Name} for [description] |
```

## Verification

After completing all steps, run:

```bash
cd packages/evlog
bun run build    # Verify build succeeds with new entry
bun run test     # Verify tests pass
```
