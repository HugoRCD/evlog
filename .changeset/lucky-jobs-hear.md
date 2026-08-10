---
"evlog": minor
---

Link PostHog logs to people and session replays, and change the OTLP record shape.

The PostHog adapter now sends `posthogDistinctId` (from `userId`) and `sessionId` as log attributes, which is how PostHog surfaces a log on a person's profile and links it to their session replay. Both sources are configurable and accept dot paths:

```ts
createPostHogDrain({ distinctIdField: 'user.id', sessionIdField: 'session.id' })
```

In `mode: 'events'`, events without a resolvable identity are now sent as anonymous PostHog events (`$process_person_profile: false`) instead of being attributed to a person named after the service. A numeric `userId` is used as the identifier rather than discarded.

OTLP log records — used by the `otlp`, `posthog`, and `hyperdx` adapters — change in two ways. Nested fields are flattened into dotted attributes (`user.id`, `ai.costUsd`) instead of one JSON string per top-level key; arrays stay serialized. The record body is now a one-line summary (`POST /api/checkout (500)`, falling back to the service name) instead of the whole event as JSON. Queries matching on the previous JSON strings need to move to the flattened attribute keys.
