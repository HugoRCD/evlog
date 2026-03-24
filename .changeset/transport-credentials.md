---
"evlog": minor
---

Add configurable `credentials` (`RequestCredentials`, default `same-origin`) for the client log transport and browser drain `fetch` calls. The Nuxt module forwards `transport.credentials` into `runtimeConfig.public.evlog` so client `initLog()` receives it.
