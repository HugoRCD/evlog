---
"evlog": patch
---

docs: move OTLP and HyperDX into the "Cloud or Self-Hosted" category — both self-host as readily as they run managed, so filing them under `cloud/` alongside Axiom and Datadog was misleading. They join Loki and ClickHouse under `hybrid/`, and each page now splits its setup into explicit self-hosted and managed sections rather than mixing the two. The old `/integrate/adapters/cloud/otlp` and `/integrate/adapters/cloud/hyperdx` URLs 301 to the new locations.
