---
"evlog": patch
---

Add end-to-end adapter tests against the real Axiom, PostHog, Sentry, and Better Stack APIs (`pnpm run test:e2e`). They run nightly via a dedicated GitHub Actions workflow plus on PRs labelled `e2e`, so any breaking change on a destination platform is caught within 24 hours instead of in production.

The Axiom suite does a full round-trip — it ingests events tagged with a unique correlation ID, queries them back via APL, and asserts presence and shape. PostHog/Sentry/Better Stack are smoke-tested (their write APIs don't expose a read path).

Pure infra: no user-facing API change, no published code change.
