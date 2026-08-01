---
"evlog": patch
---

fix(core): redact own enumerable fields only, so getter-only prototype accessors such as `DOMException.code` are never assigned to. A field that still refuses the write now warns instead of throwing, and redaction keeps covering the own fields of class instances.
