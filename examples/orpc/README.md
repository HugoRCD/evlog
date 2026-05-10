# oRPC Example

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) to test routes from the UI.

The example wires `withEvlog()` around an `OpenAPIHandler` so each procedure call becomes a single wide event, and uses `os.use(evlog())` on the procedure base to expose `context.log` and tag every event with `operation` (the procedure path).

Check your terminal for the pretty-printed wide events and your PostHog dashboard for drained logs.
