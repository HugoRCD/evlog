# Adapter E2E tests

Real-network tests against the platforms evlog ships an adapter for. They are
the safety net that catches "the destination quietly changed its API" before
your users do.

## What runs

| File | Adapter | Mode |
|---|---|---|
| `axiom.e2e.ts` | Axiom | Round-trip if token has `query:read`, smoke otherwise |
| `posthog.e2e.ts` | PostHog (OTLP + events API) | Smoke (write-only API) |
| `sentry.e2e.ts` | Sentry envelope | Smoke (DSN is write-only) |
| `better-stack.e2e.ts` | Better Stack | Smoke (source token is write-only) |

Every event is tagged with `e2e: true`, `e2e_run_id`, `e2e_branch`, `e2e_sha`,
`e2e_test`, `e2e_correlation_id` so you can grep / clean it from the
destination at any time.

## Run locally

```bash
pnpm run test:e2e
```

Tokens are read from the workspace `.env` (already gitignored). Suites whose
required env vars are missing are skipped with a visible "skipped: missing X"
label, never silently green.

Only `AXIOM_TOKEN` + `AXIOM_DATASET` are required for round-trip; the others
are smoke-only.

## Run in CI

`.github/workflows/e2e.yml` runs on:

- daily cron (`0 3 * * *` UTC)
- push to `main` (only when adapter source / e2e tests / workflow change)
- PR labelled `e2e` (only on same-repo PRs — never forks, for secret safety)
- manual dispatch

## GitHub secrets

The workflow expects these repo secrets:

- `AXIOM_TOKEN` (PAT with `query:read` for round-trip, ingest token works for smoke)
- `AXIOM_DATASET`
- `AXIOM_ORG_ID` (required for PATs)
- `POSTHOG_API_KEY`
- `SENTRY_DSN`
- `BETTER_STACK_SOURCE_TOKEN`

Set them with `gh secret set <NAME> --body '<value>'` or in the repo settings UI.

## Get round-trip on Axiom

The default Axiom ingest token (`xaat-...`) cannot read events back. To
enable full round-trip assertions, generate a Personal Access Token at
[app.axiom.co/profile](https://app.axiom.co/profile) with the `query:read`
scope and use it as `AXIOM_TOKEN`. Without it, the suite degrades to smoke
tests and prints a warning.
