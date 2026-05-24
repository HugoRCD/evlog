---
'evlog': minor
---

Add oRPC integration (`evlog/orpc`) with automatic wide-event logging. Two complementary primitives:

- `withEvlog(handler)` — wraps `RPCHandler` / `OpenAPIHandler` from `@orpc/server/fetch`. Each matched request becomes one wide event with full pipeline support (drain, enrich, `include`/`exclude`, route-based service overrides, tail sampling). Excluded routes still receive a no-op `context.log` so procedures never crash on missing fields.
- `evlog()` — procedure-level middleware (`os.use(evlog())`). Tags the wide event with `operation` (procedure path joined with `.`), forwards the request logger as `context.log`, promotes the level to `error` when a procedure throws, and bridges `createError()` / `defineErrorCatalog()` throws to `ORPCError` (code, status, message, plus `why`/`fix`/`link` in `data`).

```ts
import { os } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { evlog, withEvlog, type EvlogOrpcContext } from 'evlog/orpc'

const base = os.$context<EvlogOrpcContext>().use(evlog())

const router = {
  ping: base.handler(({ context }) => {
    context.log.set({ pinged: true })
    return { ok: true }
  }),
}

const handler = withEvlog(new RPCHandler(router))

export default async function fetch(request: Request) {
  const { matched, response } = await handler.handle(request, { prefix: '/rpc' })
  return matched ? response : new Response('Not Found', { status: 404 })
}
```

`useLogger()` is exposed for off-context access (utility modules / deep service functions). `EvlogOrpcContext` is the type to plug into `os.$context()` for typed access.

Closes [#297](https://github.com/HugoRCD/evlog/issues/297).
