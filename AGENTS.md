# evlog

TypeScript logging library focused on wide events and structured error handling. pnpm monorepo (managed with Corepack).

## Commands

```bash
pnpm install                       # install deps
pnpm run dev                       # start playground
pnpm run dev:prepare               # generate types
pnpm run build:package             # build the package
pnpm run test                      # run tests (vitest)
pnpm run lint                      # lint all packages
pnpm run typecheck                 # type-check all packages
pnpm run docs                      # start docs site (port 3000)
cd packages/evlog && pnpm run release  # publish
```

> Use `corepack enable` once so the `packageManager` field in `package.json` pins the right pnpm version automatically.

## Monorepo Structure

```
apps/playground/           Dev environment for testing
apps/docs/                 Docus documentation site
packages/evlog/            Main package
  src/nuxt/                Nuxt module
  src/nitro/               Nitro plugin (v2 + v3)
  src/vite/                Vite plugin (evlog/vite)
  src/shared/              Toolkit — exposed as evlog/toolkit (NOT evlog/shared)
  src/ai/                  AI SDK integration (evlog/ai)
  src/adapters/            Drain adapters (Axiom, OTLP, HyperDX, PostHog, Sentry, Better Stack, Datadog)
  src/enrichers/           Built-in enrichers (UserAgent, Geo, RequestSize, TraceContext)
  src/runtime/             Runtime code (client/, server/, utils/)
  test/                    Tests
.agents/skills/            Internal skills for creating adapters, enrichers, and framework integrations
```

## Conventions

- All code in TypeScript. Follow existing patterns in `packages/evlog/src/`.
- JSDoc on all public APIs.
- No HTML comments (`<!-- -->`) in Vue templates.
- `README.md` at root is a **symlink** to `packages/evlog/README.md` — edit the source directly.
- `evlog/toolkit` is the public entrypoint for `src/shared/`. Never use `evlog/shared`.
- `evlog/browser` is deprecated — use `evlog/http` instead.
- Hono does **not** export `useLogger()`. Logger access is `c.get('log')`.
- New export? Update both `packages/evlog/package.json` exports and `packages/evlog/tsdown.config.ts`.
- Creating a new adapter, enricher, or framework integration? Read the matching skill at `.agents/skills/` **before starting**:
  - `.agents/skills/create-adapter/SKILL.md`
  - `.agents/skills/create-enricher/SKILL.md`
  - `.agents/skills/create-framework-integration/SKILL.md`

## Testing

Tests live in `packages/evlog/test/` and use Vitest.

```bash
pnpm run test                                          # full suite (mocked, fast)
pnpm --filter evlog exec vitest run test/path/to/file  # single test file
pnpm run test:e2e                                      # adapters vs real endpoints
```

Write tests for all new functionality. Run tests before considering any task done.

End-to-end adapter tests (`packages/evlog/test/e2e/*.e2e.ts`) hit the real Axiom/PostHog/Sentry/Better Stack APIs. They skip automatically when env vars aren't set. They run on a daily cron + on push to `main` + on PR labelled `e2e` (`.github/workflows/e2e.yml`).

## Definition of Done

A task is complete when **all** of the following pass:

1. `pnpm run lint` exits 0
2. `pnpm run typecheck` exits 0
3. `pnpm run test` exits 0
4. New public APIs have JSDoc
5. New exports are registered in `package.json` and `tsdown.config.ts`
6. If adapter/enricher/integration: the corresponding SKILL.md was followed

## Boundaries

**Always do:**
- Run lint, typecheck, and test before reporting done
- Follow existing code patterns — read neighboring files before writing new ones
- Use the skills at `.agents/skills/` for new adapters, enrichers, or integrations

**Ask first:**
- Adding new dependencies
- Changing package exports or build config
- Architectural decisions that affect multiple packages

**Never:**
- Commit secrets, `.env` files, or API keys
- Skip tests or lint to "fix later"
- Add HTML comments in Vue `<template>` blocks
- Modify `node_modules/` or generated files

## When Stuck
- Unsure about architecture → read the relevant SKILL.md or ask
- Unclear requirements → ask a clarifying question before making large speculative changes

## Provide Feedback

**You are expected to submit feedback.** Report DX friction, documentation gaps, or anything that made your task harder than it should be. When in doubt, report it — no feedback being submitted is itself a problem.

**Submit feedback mid-work.** Don't wait until the task is done or for the user to ask.

**Update this file** when you encounter:
- A recurring mistake or easy-to-get-wrong pattern
- Explicit guidance from the maintainer
- A new convention that should be applied consistently
