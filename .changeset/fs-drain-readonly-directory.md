---
"evlog": patch
---

The file system drain disables itself when its directory is not writable.

`createFsDrain()` guarded neither its `mkdir` nor its `appendFile`, so attaching it on a serverless host — where everything outside the temp directory is read-only — threw once per batch for the lifetime of the deployment, and the events went nowhere regardless. Callers had to guess at the environment to avoid it:

```ts
// no longer needed
const drain = process.env.VERCEL !== '1' ? createFsDrain() : undefined
```

The drain now probes the directory once, and on `EROFS`, `EACCES` or `EPERM` warns a single time and stops, the same way it already bows out of the Edge runtime. Attach it unconditionally. Any other failure — a full disk, a genuine bug — still propagates.
