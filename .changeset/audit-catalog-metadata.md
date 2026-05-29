---
'evlog': minor
---

Add optional catalog metadata on `defineAuditCatalog` and `defineAuditAction` entries: `description`, `severity`, `requiresChanges`, `requiresReason`, and `redactPaths`. Metadata is exposed on each factory for introspection, docs, and review tooling.
