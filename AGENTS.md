# evlog

TypeScript logging library focused on wide events and structured error handling. Bun monorepo.

## Commands

```bash
bun install                        # install deps
bun run dev                        # start playground
bun run dev:prepare                # generate types
bun run build:package              # build the package
bun run test                       # run tests (vitest)
bun run lint                       # lint all packages
bun run typecheck                  # type-check all packages
bun run docs                       # start docs site
cd packages/evlog && bun run release  # publish
```

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
bun run test                          # full suite
bunx vitest run test/path/to/file     # single test file
```

Write tests for all new functionality. Run tests before considering any task done.

## Definition of Done

A task is complete when **all** of the following pass:

1. `bun run lint` exits 0
2. `bun run typecheck` exits 0
3. `bun run test` exits 0
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

- Docs dev wrong app → `bun run docs` runs **evlog-docs**; `bun run dev` runs the **playground** only (both default to port 3000).
- Docs / Vite **Maximum call stack size exceeded** during transform after many file changes → stop the dev server, remove `apps/docs/.nuxt`, `apps/docs/.data`, and `apps/docs/node_modules/.cache`, then `bun run docs` again.
- Docs site SSR / duplicate Vue (`vaul-vue`, `renderSlot` / `.ce`) → `patches/README.md` (Bun `patchedDependencies`)
- Tests fail after 3 attempts → stop, report the failing test with full output
- Missing dependency → check `package.json` first, then ask
- Unsure about architecture → read the relevant SKILL.md or ask
- Unclear requirements → ask a clarifying question before making large speculative changes

## Provide Feedback

**You are expected to submit feedback.** Report DX friction, documentation gaps, or anything that made your task harder than it should be. When in doubt, report it — no feedback being submitted is itself a problem.

**Submit feedback mid-work.** Don't wait until the task is done or for the user to ask.

**Update this file** when you encounter:
- A recurring mistake or easy-to-get-wrong pattern (e.g. Bun `patch` that removes a line from `package.json` must not leave a **trailing comma** in the `dependencies` object — strict JSON parsers used by Vite/Rollup will fail the build)
- Explicit guidance from the maintainer
- A new convention that should be applied consistently
