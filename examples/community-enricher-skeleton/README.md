# evlog-community-enricher-skeleton

Reference implementation showing the **complete** contract for a community evlog enricher — info interface, `defineEnricher` factory, configurable header names, and tests.

> Replace `Tenant` / `tenant` everywhere with your concept (region, deployment, feature flags, …) and ship the package as `evlog-tenant` (or whichever name fits).

## What this skeleton demonstrates

- One factory, one event field. The enricher writes to `event.tenant` and only that.
- Configurable header names — every option has a sensible default.
- `defineEnricher` handles error isolation, `mergeEventField`, and the early-return when `compute()` returns `undefined`.
- Respects `overwrite` semantics from `EnricherOptions`.
- `peerDependency` on `evlog`.

## Layout

```
src/index.ts          # createTenantEnricher
test/tenant.test.ts   # Vitest suite covering merge + overwrite + missing headers
package.json          # peerDependency on evlog
tsconfig.json
```

## Run the tests

```bash
pnpm install
pnpm --filter evlog-community-enricher-skeleton test
```

## Use it from a host app

```ts
import { defineEvlog, composeEnrichers } from 'evlog/toolkit'
import { createDefaultEnrichers } from 'evlog/enrichers'
import { createTenantEnricher } from 'evlog-tenant'

export const evlogConfig = defineEvlog({
  service: 'shop',
  enrich: composeEnrichers([
    createDefaultEnrichers(),
    createTenantEnricher({ headerName: 'x-org-id' }),
  ]),
})
```

## See also

- [Toolkit reference](https://evlog.dev/adapters/building-blocks/toolkit)
- [Custom Enrichers](https://evlog.dev/enrichers/custom)
- The matching adapter and framework skeletons in this folder.
