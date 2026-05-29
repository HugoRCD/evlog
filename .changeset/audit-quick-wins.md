---
'evlog': patch
---

Fix `mockAudit()` to capture in-request `log.audit()` events on emit (with finalized `idempotencyKey`). Add `assertAudit()` matcher on the mock result. Type `AuditFields.changes.patch` via new `AuditChanges` export.
