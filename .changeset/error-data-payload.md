---
"evlog": minor
---

`createError({ data })` returns an extra payload to the client, merged into the response body's `data` object next to `code`, `why`, `fix`, and `link`. Those four win on a key collision, and anything the client must never see still goes in `internal`. Read it client-side with `parseError(err).data`.

The Nitro and Nuxt error handler no longer drops `data` from errors thrown with h3's `createError`. It now follows Nitro's own rule for what it withholds: the message and `data` of an unhandled error are hidden in production, while a deliberate `createError({ status: 500, message })` keeps both. Development returns the error as thrown, as Nitro does.
