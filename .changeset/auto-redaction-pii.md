---
'evlog': minor
---

Add auto-redaction (PII protection) with smart partial masking, enabled by default in production (`NODE_ENV === 'production'`). Built-in patterns (credit card, email, IPv4, phone, JWT, Bearer, IBAN) use context-preserving masks (e.g. `****1111`, `a***@***.com`) instead of flat `[REDACTED]`. Disabled in development for full debugging visibility. Fine-tune with `paths`, `patterns`, and `builtins`, or opt out with `redact: false`. Custom patterns use the configurable `replacement` string. Redaction runs before console output and before any drain sees the data.
