---
"evlog": minor
---

refactor: route `evlog/nestjs`, `evlog/react-router` and `evlog/sveltekit` through `defineFrameworkIntegration()` — the three integrations each rebuilt the same request extraction, `crypto.randomUUID()` fallback, `attachForkToLogger()` call and `storage.run()` wrapper by hand instead of using the helper Hono, Express, Elysia, Fastify and oRPC already share. Behaviour is unchanged, but they now inherit anything the helper gains (including `waitUntil` extraction) for free. A new `pickBaseEvlogOptions()` toolkit export becomes the single place listing the `BaseEvlogOptions` fields, replacing the copy in `toMiddlewareOptions()` and the hand-written field list in `evlog/eve` — which silently dropped `waitUntil`, and would have dropped every option added later
