---
'evlog': patch
---

Fix wide event never being emitted when the client disconnects mid-request in `evlog/express` and `evlog/nestjs`.

Both integrations now listen for the underlying socket `close` event in addition to `finish`. When the client aborts before `res.end()` resolves, the wide event is still emitted (with the same `status`, `duration`, and accumulated context) and tagged with `connectionClosed: true` so disconnects are observable in your drain. The first event to fire wins, so successful responses are unaffected.

For background work that must outlive the HTTP response (resumable streams, post-response usage accounting), continue to use `req.log.fork('label', fn)` — once the request logger has been emitted it is sealed.

Closes [#305](https://github.com/HugoRCD/evlog/issues/305).
