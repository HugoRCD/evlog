---
"evlog": patch
---

Fix Nitro v2 error responses hanging in Nuxt/Nitro apps after thrown API errors. The Nitro v2 error handler now ends the Node response directly instead of relying on h3 `send()`, so clients receive the expected JSON error response.
