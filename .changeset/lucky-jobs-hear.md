---
"evlog": minor
---

Link PostHog logs to people and session replays, and stop duplicating the event in OTLP bodies.

The PostHog adapter now sends the attributes PostHog reads to correlate a log with the rest of your project data: `posthogDistinctId` (from `userId`) surfaces the log on that person's profile, and `sessionId` links it to their session replay. Point them elsewhere with `distinctIdField` / `sessionIdField`, which accept dot paths:

```ts
createPostHogDrain({ distinctIdField: 'user.id', sessionIdField: 'session.id' })
```

In `mode: 'events'`, events without a resolvable identity are now sent as anonymous PostHog events (`$process_person_profile: false`) instead of being merged onto a person named after the service. PostHog bills those at a lower rate. A numeric `userId` is used as the identifier rather than discarded.

OTLP log records — used by the `otlp`, `posthog`, and `hyperdx` adapters — now flatten nested event fields into dotted attributes: `ai.costUsd`, `eve.caller.principalId`, `error.message`. Backends treat attributes as facets, and a serialized object is one opaque string you cannot filter or break down by. Arrays stay serialized, since indexing them into `ai.tools.0.name` would turn a list into unbounded distinct attribute keys.

Those records also now carry a one-line body (`POST /api/checkout (500)`, falling back to the service name) instead of the whole event serialized as JSON. Every field is still sent as an attribute, so nothing is lost: the event was previously transmitted twice, which doubled ingested volume, defeated message-template clustering, and hid values from per-attribute PII scrubbing.
