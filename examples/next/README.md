# Next.js Example

Demonstrates [evlog](https://github.com/hugorcd/evlog) integration in a real Next.js App Router mini shop.

## Setup

```bash
bun install
bun run dev:next
```

Open `http://localhost:3000` and test directly from the UI:

- login as demo user
- add products to cart
- checkout with success (`card`) or forced error (`declined-card`)

Check terminal output to inspect wide events and structured errors emitted by evlog.

## API routes used by the UI

- `POST /api/auth/login` / `POST /api/auth/logout`
- `GET /api/me`
- `GET /api/products`
- `GET /api/cart` / `POST /api/cart`
- `POST /api/checkout`
- `GET /api/orders`

## DX pattern

`lib/evlog.ts` exposes `withEvlog(handler)`:

- Initializes `evlog` once (`initLogger`)
- Creates request-scoped logger automatically from `NextRequest`
- Emits one final wide event with status and duration
- Converts thrown errors to structured JSON responses via `parseError`

This keeps handlers focused on business logic while still producing rich logs.
