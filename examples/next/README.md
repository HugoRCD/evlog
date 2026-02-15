# Next.js Example

Demonstrates [evlog](https://github.com/hugorcd/evlog) integration with Next.js App Router route handlers.

## Setup

```bash
bun install
bun run dev:next
```

## Routes

- `GET /api/hello` - simple wide event with `log.set(...)`
- `POST /api/checkout` - structured error flow with `createError(...)`

## DX pattern used

`lib/evlog.ts` exposes `withEvlog(handler)`:

- Initializes `evlog` once (`initLogger`)
- Creates request-scoped logger automatically from `NextRequest`
- Emits one final wide event with status and duration
- Converts thrown errors to structured JSON responses via `parseError`

This keeps route handlers focused on business logic while still producing rich logs.
