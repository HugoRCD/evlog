---
'evlog': minor
---

Add `readFsLogs()` and `tailFsLogs()` to `evlog/fs` so any external Node tool can replay or follow the local NDJSON drain without hooking into the running app. The `fs` adapter has been write-only until now; this closes the loop.

```ts
import { readFsLogs, tailFsLogs } from 'evlog/fs'

// Replay history (ends when the last file is read)
for await (const event of readFsLogs({ since: '2026-03-01', level: 'error' })) {
  // ...
}

// Live tail (yields existing then keeps yielding new ones — abort via AbortSignal)
const ac = new AbortController()
for await (const event of tailFsLogs({ signal: ac.signal })) {
  // ...
}
```

Both helpers accept `dir`, `since`, `until`, `level`, and a custom `filter` predicate. `tailFsLogs` additionally takes `pollIntervalMs`, `fromEnd`, and `signal`. Files outside the date window are skipped without being opened, malformed lines are silently skipped, and partial-write chunks are reassembled across polls.

Useful for post-incident triage scripts, Vitest e2e assertions on emitted wide events, replay-to-Axiom backfills, and `grep`-style CLIs that pipe filtered events into `jq`.
