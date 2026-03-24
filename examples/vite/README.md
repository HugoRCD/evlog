# evlog Vite Plugin Example

Standalone Hono + Vite app showcasing the `evlog/vite` plugin.

## Features demonstrated

- **Zero-config auto-init** — no `initLogger()` call, config lives in `vite.config.ts`
- **Build-time strip** — `log.debug()` calls removed in production builds
- **Source location** — `__source: 'file:line'` injected into object-form log calls

## Run

```bash
bun run dev
```

Then visit `http://localhost:3000` and hit the API routes. Check the terminal for wide events.
