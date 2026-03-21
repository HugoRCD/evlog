---
"evlog": patch
---

fix(nitro): make `evlogErrorHandler` compatible with TanStack Start's `createMiddleware().server()` API

`evlogErrorHandler` now accepts both `(next)` and `({ next })` signatures, so `createMiddleware().server(evlogErrorHandler)` works directly without a wrapper in all TanStack Start versions.
