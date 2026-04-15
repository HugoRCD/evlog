# evlog tRPC example

Demonstrates evlog/trpc with Express + tRPC.

## Run

```
bun dev
```

## Try it

```
# query
curl "http://localhost:3000/trpc/user.getById?input=%7B%22id%22%3A%22usr_123%22%7D"

# mutation
curl -X POST http://localhost:3000/trpc/post.create \
  -H "Content-Type: application/json" \
  -d '{"0":{"json":{"title":"Hello","body":"World"}}}'
```

Each request emits one wide event with procedure name and type included.
