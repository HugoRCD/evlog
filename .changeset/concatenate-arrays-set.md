---
'evlog': minor
---

`log.set()` concatenates arrays when merging context for the same key. For example, `set({ items: [1, 2] })` followed by `set({ items: [3] })` yields `{ items: [1, 2, 3] }` instead of replacing with `[3]`. Plain objects are still deep-merged recursively; if either the existing or incoming value is not an array, the new value replaces the old one.

**Breaking change:** Call sites that relied on the last `set` overwriting an array now accumulate elements. To replace a value at emit time, use `emit({ ... })` overrides or a different field name.
