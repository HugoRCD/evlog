---
'evlog': minor
---

Add `evlog/better-auth` integration for automatic user identification from [Better Auth](https://better-auth.com/) sessions.

**New exports** (`evlog/better-auth`):
- `identifyUser(log, session, options?)` — sets `userId`, `user`, and `session` fields on a wide event. Returns `true` if identified
- `createAuthMiddleware(auth, options?)` — framework-agnostic `(log, headers, path?) => Promise<boolean>` with route filtering, timing capture, and lifecycle hooks
- `createAuthIdentifier(auth, options?)` — Nitro `request` hook factory for standalone Nitro apps
- `maskEmail(email)` — utility to mask emails for safe logging (`h***@example.com`)
- `BetterAuthInstance` — reusable type for the auth parameter

**Features:**
- `include`/`exclude` route pattern filtering on `createAuthMiddleware`
- `extend` callback for Better Auth plugin fields (organizations, roles, etc.)
- `auth.resolvedIn` timing in every wide event
- `auth.identified` boolean in every wide event
- `session.userAgent` captured by default
- `onIdentify`/`onAnonymous` lifecycle hooks
- `console.warn` in development when session resolution fails
