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

## Error and logging flow

Each route shows the full control flow explicitly (no route wrapper):

- Initialize request-scoped logger with `createNextLogger(request)`
- Run business logic and throw `createError(...)` when a condition fails
- Emit success status with `log.emit({ status })`
- In `catch`, map errors to structured responses via `emitErrorAndRespond(log, error)`

This keeps `createError` visible in real route code while preserving clean logs.
The emitted wide event includes `why`, `fix`, and `link` fields for failed flows.
