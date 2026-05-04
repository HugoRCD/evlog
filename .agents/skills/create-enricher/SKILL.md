---
name: create-evlog-enricher
description: Create a new built-in evlog enricher to add derived context to wide events. Use when adding a new enricher (e.g., for deployment metadata, tenant context, feature flags, etc.) to the evlog package. Covers source code, tests, and all documentation.
---

# Create evlog Enricher

Add a new built-in enricher to evlog. Every enricher is built on the public toolkit primitive `defineEnricher` from `evlog/toolkit` — so a community enricher has the same shape as a built-in one.

## PR Title

Recommended format for the pull request title:

```
feat: add {name} enricher
```

The exact wording may vary depending on the enricher (e.g., `feat: add user agent enricher`, `feat: add geo enricher`), but it should always follow the `feat:` conventional commit prefix.

## Touchpoints Checklist

| # | File | Action |
|---|------|--------|
| 1 | `packages/evlog/src/enrichers/index.ts` | Add enricher source (one `defineEnricher` call) |
| 2 | `packages/evlog/test/enrichers.test.ts` | Add tests |
| 3 | `apps/docs/content/4.enrichers/2.built-in.md` | Add enricher to built-in docs |
| 4 | `apps/docs/content/4.enrichers/1.overview.md` | Add enricher to overview cards |
| 5 | `skills/review-logging-patterns/SKILL.md` | Add enricher to the Built-in line in the Enrichers section |
| 6 | `README.md` + `packages/evlog/README.md` | Add enricher to README enrichers section |

**Important**: Do NOT consider the task complete until all 6 touchpoints have been addressed.

## Naming Conventions

| Placeholder | Example (UserAgent) | Usage |
|-------------|---------------------|-------|
| `{name}` | `userAgent` | camelCase for event field key |
| `{Name}` | `UserAgent` | PascalCase in function/interface names |
| `{DISPLAY}` | `User Agent` | Human-readable display name |

## Step 1: Enricher Source — built on `defineEnricher`

Add the enricher to `packages/evlog/src/enrichers/index.ts`. Read [references/enricher-template.md](references/enricher-template.md) for the full annotated template.

The contract is `defineEnricher<T>({ name, field, compute }, options?)`. You only ship one piece of logic:

- **`compute(ctx)`** — return the computed value (typed as `T`) or `undefined` to skip.

`defineEnricher` handles the rest:

- merging via `mergeEventField` (respecting `options.overwrite`)
- error isolation (throws are caught and logged, never propagated)
- skipping when `compute` returns `undefined`

Key rules:

- **Use the toolkit helpers**: `getHeader()` for case-insensitive header lookup, `normalizeNumber()` for numeric strings — both from `../shared/headers` (re-exported by `evlog/toolkit`).
- **Single event field** — each enricher writes one top-level field on `ctx.event`.
- **Factory pattern** — `create{Name}Enricher(options?: EnricherOptions)` always returns the result of `defineEnricher(...)`.
- **No side effects** — never throw, never log; rely on `defineEnricher`'s built-in error handling if something goes wrong.

## Step 2: Tests

Add tests to `packages/evlog/test/enrichers.test.ts`.

Required test categories:

1. **Sets field from headers** — verify the enricher populates the event field correctly
2. **Skips when header missing** — verify no field is set when the required header is absent
3. **Preserves existing data** — verify `overwrite: false` (default) doesn't replace user-provided fields
4. **Overwrites when requested** — verify `overwrite: true` replaces existing fields
5. **Handles edge cases** — empty strings, malformed values, case-insensitive header names

Follow the existing test structure in `enrichers.test.ts` — each enricher has its own `describe` block.

## Step 3: Update Built-in Docs

Edit `apps/docs/content/4.enrichers/2.built-in.md` to add a new section for the enricher.

Each enricher section follows this structure:

```markdown
## {DISPLAY}

[One-sentence description of what the enricher does.]

**Sets:** `event.{name}`

\`\`\`typescript
const enrich = create{Name}Enricher()
\`\`\`

**Output shape:**

\`\`\`typescript
interface {Name}Info {
  // fields
}
\`\`\`

**Example output:**

\`\`\`json
{
  "{name}": {
    // example values
  }
}
\`\`\`
```

## Step 4: Update Overview Page

Edit `apps/docs/content/4.enrichers/1.overview.md` to add a card for the new enricher in the `::card-group` section (before the Custom card).

## Step 5: Update `skills/review-logging-patterns/SKILL.md`

In `skills/review-logging-patterns/SKILL.md`, find the **Enrichers** section and add the new enricher to the `Built-in:` line.

## Step 6: Update README

Add the enricher to the enrichers section in `packages/evlog/README.md` (the root `README.md` is a symlink to it).

## Verification

```bash
cd packages/evlog
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
```
