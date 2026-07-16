---
'evlog': major
---

Move `createLoggerStorage` to `evlog/toolkit/storage` so the main `evlog/toolkit` entry no longer imports `node:async_hooks`. Custom integrations that only need middleware helpers can run on Cloudflare Workers without `nodejs_compat`.

```ts
import { defineFrameworkIntegration } from 'evlog/toolkit'
import { createLoggerStorage } from 'evlog/toolkit/storage'
```
