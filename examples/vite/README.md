# evlog Vite Plugin Example

Standalone Hono + Vite app showcasing the `evlog/vite` plugin.

## Features demonstrated

- **Zero-config auto-init** — no `initLogger()` call, config lives in `vite.config.ts`
- **Auto-imports** — `log`, `createError`, `parseError` available without imports
- **Build-time strip** — `log.debug()` calls removed in production builds
- **Source location** — `__source: 'file:line'` injected into object-form log calls
- **Client-side init** — browser logging auto-initialized via `transformIndexHtml`

## Run

```bash
bun run dev
```

Then visit `http://localhost:3000` and hit the API routes. Check the terminal for server logs and the browser console for client logs.
