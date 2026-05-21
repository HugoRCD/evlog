---
'evlog': minor
---

Add `log.setLevel(level)` to promote the wide event level explicitly without touching the `error` context.

`log.error(err)` populates `error: { name, message, stack, ... }` from the thrown value. When you want to mark the event as `error` (or `warn`) while controlling the `error` field yourself — typed error codes, no stack, custom shapes — call `log.setLevel('error' | 'warn' | 'info' | 'debug')` and pair it with `log.set({ error: { code: 'PAYMENT_DECLINED' } })`. The explicit level wins over the level computed from `.error()` / `.warn()`.

```ts
log.setLevel('error')
log.set({ error: { code: 'PAYMENT_DECLINED', reason: 'insufficient_funds' } })
```

Closes [#301](https://github.com/HugoRCD/evlog/issues/301).
