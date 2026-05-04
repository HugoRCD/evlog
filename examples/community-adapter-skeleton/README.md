# evlog-community-adapter-skeleton

Reference implementation showing the **complete** contract for a community evlog drain adapter — config interface, `defineHttpDrain` factory, exported converter, and tests.

> Replace `Acme` / `acme` / `ACME` everywhere with your service name and ship the package as `evlog-acme` (or whichever vendor name fits).

## What this skeleton demonstrates

- Standard option naming: `apiKey`, `endpoint`, `timeout`.
- Standard config priority via `resolveAdapterConfig` (overrides → `runtimeConfig.evlog.acme` → `runtimeConfig.acme` → `NUXT_ACME_*` → `ACME_*`).
- Pure `toAcmeEvent` converter exposed for unit testing.
- `defineHttpDrain` handles batching, retries, timeouts, and error isolation — your adapter file stays at ~50 lines.
- `peerDependency` on `evlog` (community packages should never bundle their own copy).

## Layout

```
src/index.ts        # createAcmeDrain — the only thing your users import
test/acme.test.ts   # Vitest suite covering happy path + missing config
package.json        # peerDependency on evlog
tsconfig.json
```

## Run the tests

```bash
pnpm install
pnpm --filter evlog-community-adapter-skeleton test
```

## Use it from a host app

```ts
import { defineEvlog } from 'evlog/toolkit'
import { createAcmeDrain } from 'evlog-acme'

export const evlogConfig = defineEvlog({
  service: 'shop',
  drain: createAcmeDrain(),
})
```

## See also

- [Toolkit reference](https://evlog.dev/adapters/building-blocks/toolkit)
- [Custom Adapters](https://evlog.dev/adapters/building-blocks/custom)
- The matching enricher and framework skeletons in this folder.
