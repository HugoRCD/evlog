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

Tests live in `packages/evlog/test/` (mirrors `src/`) and use Vitest. **Read `packages/evlog/test/README.md` before writing or editing tests** — it has the file layout, the framework runtime fidelity matrix, and the helper decision table.

```bash
pnpm run test                                          # full suite (~1.5s)
pnpm --filter evlog exec vitest run test/path/to/file  # single test file
pnpm test:coverage                                     # with thresholds; :open for HTML
pnpm api:snapshot                                      # diff public API surface; :update to accept
pnpm mutate                                            # Stryker (slow; weekly cron in CI)
pnpm test:e2e                                          # adapters vs real endpoints
```

Rules:
1. Every change has a matching test. Bug fixes require a *failing* regression test before the fix.
2. Always import real source helpers, never re-implement them in tests.
3. Use the helpers in `test/helpers/` (drain spies, fake timers, fetch mock, framework matrix). The full decision table is in `test/README.md`.
4. Framework tests must use the framework's real request driver (supertest, `app.inject`, `app.handle`, `Test.createTestingModule`, ...) — see the fidelity matrix in `test/README.md`.

## Definition of Done

A task is complete when **all** of the following pass:

1. `pnpm run lint`, `pnpm run typecheck`, `pnpm run test` exit 0
2. The change has a matching test (bug fix → failing regression first, then the fix)
3. `pnpm test:coverage` stays above the configured thresholds; if you changed a public export, the `pnpm api:snapshot` diff was reviewed
4. New public APIs have JSDoc
5. New exports are registered in `package.json#exports`, `package.json#typesVersions`, and `tsdown.config.ts`
6. If adapter/enricher/integration: the matching `.agents/skills/create-*/SKILL.md` was followed
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
- Ship a feature, bug fix, or refactor without a matching test
- Add HTML comments in Vue `<template>` blocks
- Modify `node_modules/` or generated files
- Open a PR for a user-facing change without a changeset

## Git & PRs — local always OK, remote on explicit instruction

Default: anything that stays on the local clone is fine, anything that touches the remote or GitHub requires an explicit instruction in the task at hand. Never act on assumption — if the maintainer didn't ask for a push or a PR, prepare the branch locally and stop there.

**OK (local-only, no ask needed):**
- `git branch`, `git checkout`, `git switch`, `git checkout -b` — create and move between branches freely
- `git add`, `git commit` — staging and local commits are fine
- `git status`, `git diff`, `git log`, `git show`, `git stash`, `git restore`, `git reset` (local only) — read and rearrange the working tree
- `gh pr view`, `gh pr list`, `gh pr diff`, `gh issue view`, `gh run view` — read-only GitHub queries

**OK when the maintainer explicitly asks (in the current task):**
- `git push -u origin <feature-branch>` — push a feature branch you just prepared
- `git push --force-with-lease origin <feature-branch>` — only on a feature branch you authored, after a clean rebase
- `gh pr create --base main --head <feature-branch>` — open a PR
- Write a **PR title** (Conventional Commits, see above) and a **PR body** — keep the body factual, mirror the changeset, reference the issue (`Closes #X`); no marketing copy

**Never (no exceptions, even when asked):**
- Push directly to `main` (or `master`) — protected, always goes through a PR
- `git push --force` without `--with-lease`, `git push --tags`
- `gh pr merge`, `gh pr close`, `gh pr review`, `gh issue create`, `gh issue edit`, `gh release create`
- Write a changelog entry, release note, or commit message **body** with multi-paragraph narrative — the changeset is the source of truth; commit subjects stay single-line, PR bodies stay short
- Add a `Co-authored-by`, `Signed-off-by`, "Generated with…", "🤖", or any signature/attribution that names an agent, model, or tool — **the work is the maintainer's, full stop**

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
