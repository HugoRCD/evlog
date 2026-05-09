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

### Changesets

**Every user-facing change must include a changeset.** Before opening a PR for features, bug fixes, or breaking changes, run `pnpm changeset` and commit the generated `.changeset/*.md` file alongside the code.

- **When to add a changeset:** any change that affects the public API, adds a feature, fixes a bug, or introduces a breaking change. If a consumer of evlog would notice the difference, it needs a changeset.
- **When you can skip:** internal-only changes (CI config, docs typos, test refactors, devDeps bumps) that don't touch the published package.
- **Bump type:** `patch` for fixes, `minor` for features, `major` for breaking changes.
- **Description:** write from the consumer's perspective — what changed and how to use it. See existing changesets in `.changeset/` for tone and level of detail.

A PR without a changeset for a user-facing change will not be merged.

### Commits & PR titles

PR titles and commits follow [Conventional Commits](https://conventionalcommits.org). The CI source of truth is `.github/workflows/semantic-pull-request.yml` (lints PR titles via `amannn/action-semantic-pull-request`); `.github/pull_request_template.md` mirrors the same lists for contributors.

- **Subject must not start with an uppercase letter.** `feat: add stream server` ✓ — `feat: Add stream server` ✗.
- **Omit the scope when the change is cross-cutting** (touches multiple subsystems, or is repo-wide). Don't use `evlog` as a scope: the whole monorepo *is* evlog, so a no-scope title already means "evlog itself".
- **Use a scope only to point at one subsystem.** Adapters get their own scope (one per entrypoint, e.g. `axiom`, `datadog`, `fs`); framework integrations get the framework's name (`nuxt`, `next`, `hono`, ...); core internals (logger, pipeline, error, redact, catalog) go under `core`.
- **When you add a new subsystem** (adapter, integration, top-level entrypoint), add its scope to **both** the workflow and the template in the same PR. Keep both lists alphabetically sorted.

### Doc animation components (`apps/docs/app/components/content/`)

MDC animation components (e.g. `EnricherChain`, `DrainFanOut`, `StreamBus`) follow a strict set of rules:

- **Fixed outer size, always.** The component must occupy the same height and width from t=0 to the end of the loop. Layout below the animation must not shift while the user reads the page.
- **Pre-allocate every slot.** Lines, rows, frames, buffer cells must all exist in the DOM from the start. Animate `opacity`, `color`, `transform` — never `max-height: 0 → N`, never conditional `v-if` on structural elements.
- **Use `useTimedSequence`** from `~/composables/useTimedSequence` for the timeline. Honor `prefers-reduced-motion` by snapping to the final state.
- **Wrap in `<Motion>` from `motion-v`** with `not-prose my-8` and an `IntersectionObserver` so the animation starts when scrolled into view.
- **Header bar** with status pill + play/pause + restart buttons (mirror `DrainFanOut.vue`).
- **Compact by default**: `text-[10px]` for body, `text-[9px]` for footers/labels, `leading-tight` or `leading-snug`, `py-1.5` / `py-2` headers/footers, `space-y-0.5` or none, `gap-1.5` or smaller. The doc page width (sidebar + TOC) is narrow; aim for a final height under ~280px.
- Use `<div>` (not `<ol>/<li>`) for repeating slots — list elements collide with grid layout in Docus.
- **No viewport-dependent layout shift.** Stick to a single column at any width or use `sm:` for the optional split — never `lg:` (the doc content area never reaches the `lg:` breakpoint).

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
7. A changeset is included for any user-facing change (`pnpm changeset`)

## Boundaries

**Always do:**
- Run lint, typecheck, and test before reporting done
- Follow existing code patterns — read neighboring files before writing new ones
- Use the skills at `.agents/skills/` for new adapters, enrichers, or integrations
- Add a changeset (`pnpm changeset`) for every user-facing change — features, bug fixes, breaking changes

**Ask first:**
- Adding new dependencies
- Changing package exports or build config
- Architectural decisions that affect multiple packages

**Never:**
- Commit secrets, `.env` files, or API keys
- Skip tests or lint to "fix later"
- Add HTML comments in Vue `<template>` blocks
- Modify `node_modules/` or generated files
- Open a PR for a user-facing change without a changeset

## Git & PRs — local OK, remote stays with the maintainer

The line is **the network**: anything that stays on the local clone is fine; anything that touches the remote or GitHub waits for the maintainer.

**OK (local-only, no ask needed):**
- `git branch`, `git checkout`, `git switch`, `git checkout -b` — create and move between branches freely
- `git add`, `git commit` — staging and local commits are fine
- `git status`, `git diff`, `git log`, `git show`, `git stash`, `git restore`, `git reset` (local only) — read and rearrange the working tree
- `gh pr view`, `gh pr list`, `gh pr diff`, `gh issue view`, `gh run view` — read-only GitHub queries

**Never (no exceptions, even if it would be "helpful"):**
- `git push`, `git push --force`, `git push --tags` — pushing to the remote is the maintainer's call, every time
- `gh pr create`, `gh pr edit`, `gh pr merge`, `gh pr close`, `gh pr review`, `gh issue create`, `gh issue edit`, `gh release create`, or any other GitHub mutation
- Write a PR description, PR body, changelog entry, or release note draft — even as a "suggestion in chat"
- Write a commit message **body** (a single Conventional Commits subject line is fine; no multi-paragraph rationale unless explicitly asked)
- Add a `Co-authored-by`, `Signed-off-by`, "Generated with…", "🤖", or any signature/attribution that names an agent, model, or tool — **the work is the maintainer's, full stop**

**The only narrative artifacts you may produce, and only when explicitly asked:**
- A **PR title** (Conventional Commits, see above)
- A **branch name**

If a task seems to need a push, a PR, or a longer-form description, stop and ask. Don't pre-draft "in case it helps".

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
