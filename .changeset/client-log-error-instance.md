---
"evlog": patch
---

fix(core): serialize Error instances passed to the client `log.error()` — `name`, `message` and `stack` are non-enumerable, so an `Error` spread into a wide event contributed nothing and the call emitted an event with no error at all. The docs teach `log.error(new Error(...))` for Next.js client components, and the type only accepted a tag pair or a plain object, so the pattern failed to type check as well. Errors now land under `error` with the same shape the server logger stores, including `code`, `status`, `cause` and friends
