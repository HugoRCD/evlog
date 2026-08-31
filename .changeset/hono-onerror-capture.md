---
"evlog": patch
---

`evlog/hono` records errors again in apps that register `app.onError`. Hono hands a thrown error to `onError` at the route's own dispatch level, so the middleware resumed as if the request had succeeded and the failure was emitted as an info event with no `error` field. The wide event now carries the error and the status the handler actually returned.
