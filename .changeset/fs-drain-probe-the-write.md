---
"evlog": patch
---

The file system drain now detects an unwritable directory reliably.

The previous check probed with `mkdir({ recursive: true })`, which is a no-op on a directory that already exists and therefore succeeds even when that directory is read-only. A deployment whose log directory was baked in still threw on every batch. The probe also ran per call rather than per resolved state, so concurrent batches could each warn.

The write itself is now the check: the first append that fails with `EROFS`, `EACCES` or `EPERM` disables the drain for that directory and warns once. Any other failure, including a full disk, is reported by the drain as before.
