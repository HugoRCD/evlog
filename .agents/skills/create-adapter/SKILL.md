---
name: create-evlog-adapter
description: Create a new built-in evlog adapter to send wide events to an external observability platform. Use when adding a new drain adapter (e.g., for Datadog, Sentry, Loki, Elasticsearch, etc.) to the evlog package. Covers source code, build config, package exports, tests, and all documentation.
---

# Create evlog Adapter

Add a new built-in adapter to evlog. Every adapter follows the same architecture. This skill walks through all 8 touchpoints. **Every single touchpoint is mandatory** -- do not skip any.

## PR Title

Recommended format for the pull request title:

```
feat: add {name} adapter
```

The exact wording may vary depending on the adapter (e.g., `feat: add OTLP adapter`, `feat: add Axiom drain adapter`), but it should always follow the `feat:` conventional commit prefix.

## Touchpoints Checklist

| # | File | Action |
|---|------|--------|
| 1 | `packages/evlog/src/adapters/{name}.ts` | Create adapter source |
| 2 | `packages/evlog/build.config.ts` | Add build entry |
| 3 | `packages/evlog/package.json` | Add `exports` + `typesVersions` entries |
| 4 | `packages/evlog/test/adapters/{name}.test.ts` | Create tests |
| 5 | `apps/docs/content/3.adapters/{n}.{name}.md` | Create adapter doc page (before `custom.md`) |
| 6 | `apps/docs/content/3.adapters/1.overview.md` | Add adapter to overview (links, card, env vars) |
| 7 | `AGENTS.md` | Add adapter to the "Built-in Adapters" table |
| 8 | Renumber `custom.md` | Ensure `custom.md` stays last after the new adapter |

**Important**: Do NOT consider the task complete until all 8 touchpoints have been addressed.

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
2. **`getRuntimeConfig()`** -- import from `./_utils` (shared helper, do NOT redefine locally)
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

## Step 5: Adapter Documentation Page

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
8. **Troubleshooting** -- common errors (missing config, auth failures)
9. **Direct API Usage** -- `sendTo{Name}()` and `sendBatchTo{Name}()` examples
10. **Next Steps** -- links to other adapters and best practices

Use the existing Axiom adapter page (`apps/docs/content/3.adapters/2.axiom.md`) as a reference for tone, structure, and depth.

## Step 6: Update Adapters Overview Page

Edit `apps/docs/content/3.adapters/1.overview.md` to add the new adapter in **three** places:

### 6a. Frontmatter `links` array

Add a link entry alongside the existing adapters:

```yaml
- label: "{Name}"
  icon: i-simple-icons-{name}
  to: /adapters/{name}
  color: neutral
  variant: subtle
```

### 6b. `::card-group` section

Add a card block for the new adapter (before the Custom card):

```markdown
  :::card
  ---
  icon: i-simple-icons-{name}
  title: {Name}
  to: /adapters/{name}
  ---
  [Short description of what the adapter does.]
  :::
```

### 6c. Zero-Config Setup `.env` example

Add the adapter's env vars in the `.env` code block. The variable names depend on the service (e.g., `NUXT_AXIOM_TOKEN`, `NUXT_OTLP_ENDPOINT`, `NUXT_POSTHOG_API_KEY`):

```bash
# {Name}
NUXT_{NAME}_<RELEVANT_VAR>=xxx
```

## Step 7: Update AGENTS.md

Add the new adapter to the **"Built-in Adapters"** table in the root `AGENTS.md` file, in the "Log Draining & Adapters" section:

```markdown
| {Name} | `evlog/{name}` | Send logs to {Name} for [description] |
```

Also add a usage example block (following the pattern of existing adapters in AGENTS.md):

```markdown
**Using {Name} Adapter:**

\`\`\`typescript
// server/plugins/evlog-drain.ts
import { create{Name}Drain } from 'evlog/{name}'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:drain', create{Name}Drain())
})
\`\`\`

Set the required environment variables (e.g., \`NUXT_{NAME}_TOKEN\`, \`NUXT_{NAME}_ENDPOINT\`, etc. -- depends on the service).
```

## Step 8: Renumber `custom.md`

If the new adapter's number conflicts with `custom.md`, renumber `custom.md` to be the last entry. For example, if the new adapter is `5.{name}.md`, rename `5.custom.md` to `6.custom.md`.

## Verification

After completing all steps, run:

```bash
cd packages/evlog
bun run build    # Verify build succeeds with new entry
bun run test     # Verify tests pass
```
