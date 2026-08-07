---
"evlog": patch
---

The file system drain now detects an unwritable directory reliably.

The previous check probed with `mkdir({ recursive: true })`, which is a no-op on a directory that already exists and therefore succeeds even when that directory is read-only. A deployment whose log directory already existed still threw on every batch. The probe also ran per call rather than per resolved state, so concurrent batches could each warn.

The write itself is now the check: once an append fails with `EROFS`, `EACCES` or `EPERM`, the drain is disabled for that directory and warns once. Batches already in flight when that happens still attempt their own append. Any other failure, including a full disk, is reported by the drain as before.
