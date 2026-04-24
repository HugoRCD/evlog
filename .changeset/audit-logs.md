---
'evlog': minor
---

Add first-class audit logs as a thin layer over existing evlog primitives. Audit is not a parallel system: it is a typed `audit` field on the wide event plus a few opt-in helpers and drain wrappers. Companies already running evlog can enable audit logs by adding 1 enricher + 1 drain wrapper + `log.audit()`, with zero new sub-exports.

New API on the main `evlog` entrypoint:

- `AuditFields` reserved on `BaseWideEvent` (`action`, `actor`, `target`, `outcome`, `reason`, `changes`, `causationId`, `correlationId`, `version`, `idempotencyKey`, `context`, `signature`, `prevHash`, `hash`) plus `AUDIT_SCHEMA_VERSION`.
- `log.audit(fields)` and `log.audit.deny(reason, fields)` on `RequestLogger` and the return value of `createLogger()`. Sugar over `log.set({ audit })` that also force-keeps the event through tail sampling.
- Standalone `audit(fields)` for jobs / scripts / CLIs.
- `withAudit({ action, target, actor? })(fn)` higher-order wrapper that auto-emits `success` / `failure` / `denied` based on the wrapped function's outcome (with `AuditDeniedError` for AuthZ refusals).
- `defineAuditAction(name, opts)` typed action registry, `auditDiff(before, after)` redact-aware JSON Patch helper, `mockAudit()` test utility (`expectIncludes`, `expectActionCount`, `clear`, `restore`).
- `auditEnricher({ tenantId?, betterAuth? })` enricher that auto-fills `event.audit.context` (`requestId`, `traceId`, `ip`, `userAgent`, `tenantId`) and optionally bridges `actor` from a session.
- `auditOnly(drain, { await? })` drain wrapper that filters to events with `event.audit` set, optionally awaiting writes for crash safety. `signed(drain, { strategy: 'hmac' | 'hash-chain', ... })` generic tamper-evidence wrapper with pluggable `state.{load,save}` for hash chains.
- `auditRedactPreset` strict PII preset composable with existing `RedactConfig`.

Audit events are always force-kept by tail sampling and get a deterministic `idempotencyKey` derived from `action + actor + target + timestamp` so retries are safe across drains. Schema is OTEL-compatible and the `actor.type === 'agent'` slot carries `model`, `tools`, `reason`, `promptId` for AI agent auditing. No new sub-exports were added.
