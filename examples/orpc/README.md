# evlog oRPC example

Demonstrates evlog/orpc with Express + oRPC.

## Run

```
bun dev
```

## Try it

```
# query
curl -X POST http://localhost:3000/rpc/user/getById \
  -H "Content-Type: application/json" \
  -d '{"json":{"id":"usr_123"}}'

# mutation
curl -X POST http://localhost:3000/rpc/post/create \
  -H "Content-Type: application/json" \
  -d '{"json":{"title":"Hello","body":"World"}}'

# error case
curl -X POST http://localhost:3000/rpc/user/getById \
  -H "Content-Type: application/json" \
  -d '{}'
```

Each request emits one wide event with the oRPC procedure path included.
