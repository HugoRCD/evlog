---
"evlog": patch
---

fix(nitro): always create logger in request hook so `useLogger()` works in server middleware

Previously, calling `useLogger(event)` inside a Nuxt server middleware would throw `"Logger not initialized"` because the Nitro plugin skipped logger creation for routes not matching `include` patterns. Since middleware runs for every request, this made it impossible to use `useLogger` there.

The `shouldLog` filtering is now evaluated at emit time instead of creation time — the logger is always available on `event.context.log`, but events for non-matching routes are silently discarded.
