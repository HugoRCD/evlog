---
"evlog": patch
---

fix(nuxt): restore `error.vue` rendering for SSR page errors

With `evlog/nuxt` installed, every non-API SSR error (404/500) was returned as raw Nitro JSON instead of rendering the framework error page. The Nitro error handler now delegates document/HTML navigations to the next handler in Nitro's chain (Nuxt's `error.vue` renderer) while still serializing JSON for API routes and `EvlogError` responses.

Closes #390
