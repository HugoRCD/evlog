---
"evlog": minor
---

Link PostHog logs to people and session replays, and add a compact OTLP record shape.

The PostHog adapter now sends `posthogDistinctId` (from `userId`) and `sessionId` as log attributes, which is how PostHog surfaces a log on a person's profile and links it to their session replay. Both sources are configurable and accept dot paths:

```ts
createPostHogDrain({ distinctIdField: 'user.id', sessionIdField: 'session.id' })
```

In `mode: 'events'`, events without a resolvable identity are now sent as anonymous PostHog events (`$process_person_profile: false`) instead of being attributed to a person named after the service. A numeric `userId` is used as the identifier rather than discarded.

The `otlp`, `posthog`, and `hyperdx` adapters accept a new `recordShape` option. `'compact'` sends a one-line body (`POST /api/checkout (500)`) and flattens nested fields into dotted attributes (`user.id`, `ai.costUsd`) that backends can filter and break down by:

```ts
createOTLPDrain({ recordShape: 'compact' })
```

In `mode: 'events'`, `'compact'` flattens the same way, so nested fields become properties the PostHog UI can filter and break down by rather than one opaque object.

The default stays `'json'` — the whole event in the body, one attribute per top-level field, nested properties untouched — so existing records and the queries built on them are unchanged. `'compact'` becomes the default in the next major.
