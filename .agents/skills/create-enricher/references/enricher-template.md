# Enricher Source Template

Template for adding a new enricher to `packages/evlog/src/enrichers/index.ts`.

Replace `{Name}`, `{name}`, and `{DISPLAY}` with the actual enricher name.

## Info Interface

Define the output shape of the enricher:

```typescript
export interface {Name}Info {
  /** Description of field */
  field1?: string
  /** Description of field */
  field2?: number
}
```

## Factory Function

```typescript
/**
 * Enrich events with {DISPLAY} data.
 * Sets `event.{name}` with `{Name}Info` shape: `{ field1?, field2? }`.
 */
export function create{Name}Enricher(options: EnricherOptions = {}): (ctx: EnrichContext) => void {
  return (ctx) => {
    // 1. Extract data from headers (case-insensitive)
    const value = getHeader(ctx.headers, 'x-my-header')
    if (!value) return  // Early return if no data available

    // 2. Compute the enriched data
    const info: {Name}Info = {
      field1: value,
      field2: Number(value),
    }

    // 3. Merge with existing event field (respects overwrite option)
    ctx.event.{name} = mergeEventField<{Name}Info>(ctx.event.{name}, info, options.overwrite)
  }
}
```

## Architecture Rules

1. **Use existing helpers** -- `getHeader()` for case-insensitive header lookup, `mergeEventField()` for safe merging, `normalizeNumber()` for parsing numeric strings
2. **Single event field** -- each enricher sets one top-level field on `ctx.event`
3. **Factory pattern** -- always return a function, never execute directly
4. **EnricherOptions** -- accept `{ overwrite?: boolean }` for merge control
5. **Early return** -- skip if required data is missing
6. **No side effects** -- never throw, never log, only mutate `ctx.event`
7. **Clean undefined values** -- skip the enricher entirely if all computed values are `undefined`

## Available Helpers

These helpers are already defined in the enrichers file:

```typescript
// Case-insensitive header lookup
function getHeader(headers: Record<string, string> | undefined, name: string): string | undefined

// Merge computed data with existing event fields, respecting overwrite
function mergeEventField<T extends object>(existing: unknown, computed: T, overwrite?: boolean): T

// Parse string to number, returning undefined for non-finite values
function normalizeNumber(value: string | undefined): number | undefined
```

## Data Sources

Enrichers typically read from:

- **`ctx.headers`** -- HTTP request headers (sensitive headers already filtered)
- **`ctx.response?.headers`** -- HTTP response headers
- **`ctx.response?.status`** -- HTTP response status code
- **`ctx.request`** -- Request metadata (method, path, requestId)
- **`process.env`** -- Environment variables (for deployment metadata)
- **`ctx.event`** -- The event itself (for computed/derived fields)
