---
"evlog": patch
---

Align `evlogErrorHandler` with TanStack Start’s `createMiddleware().server()` types: widen `next()` to sync-or-async results, match `RequestServerFn` return typing via `RequestServerResult`, and declare an optional peer on `@tanstack/start-client-core` for accurate declarations ([#235](https://github.com/HugoRCD/evlog/issues/235), [EVL-142](https://linear.app/evlog/issue/EVL-142)).
