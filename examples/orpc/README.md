# oRPC Example

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) to test routes from the UI.

The example wires `withEvlog()` around an `OpenAPIHandler` so each procedure call becomes a single wide event, and uses `os.use(evlog())` on the procedure base to expose `context.log` and tag every event with `operation` (the procedure path joined with `.`).

## What it demonstrates

| Endpoint | RPC feature shown |
|---|---|
| `GET /health` | Minimal procedure, `context.log.set()` |
| `GET /users` | Nested router (`users.list`) → `operation: 'users.list'` on the wide event |
| `GET /users/{id}` | Zod input schema, context accumulation in a service via `useLogger()`, email masking before logging |
| `GET /users/unknown` | Typed `errors.USER_NOT_FOUND({ data: { userId } })` from `os.errors({...})` — clean `defined: true` response |
| `POST /payments/charge` | Typed `errors.PAYMENT_DECLINED` with structured `data` (reason + retryable flag) |
| `DELETE /admin/danger/{id}` | Auth middleware injecting `context.user`, role check, typed `FORBIDDEN` |

## What to look for in the terminal

Each request emits one pretty-printed wide event with:

- `operation` — the full procedure path (e.g. `payments.charge`, `users.get`).
- `auth` — set by the auth middleware, only on procedures that go through `authed`.
- `error` — only on `error` events: `code`, `status`, and `data` are captured from the `ORPCError` thrown by `errors.<NAME>(...)`.
- `runtime: 'bun'` and `pid` — added by the `enrich` callback configured on `withEvlog()`.

Events are also drained to PostHog when `POSTHOG_API_KEY` is set in the root `.env`.
