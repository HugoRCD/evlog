# evlog Next.js tRPC example

Demonstrates evlog/next + evlog/trpc with Next.js App Router.

## Run

```
bun dev
```

## Try it

```bash
# query
curl "http://localhost:3000/api/trpc/user.getById?input=%7B%22id%22%3A%22usr_123%22%7D"

# mutation
curl -X POST http://localhost:3000/api/trpc/post.create \
  -H "Content-Type: application/json" \
  -d '{"json":{"title":"Hello","body":"World"}}'

# health check
curl "http://localhost:3000/api/trpc/health.check"
```

Each request emits one wide event with `procedure` and `type` included alongside any context set via `ctx.log.set()` or `useLogger()`.
