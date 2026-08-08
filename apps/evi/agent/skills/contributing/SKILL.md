---
name: contributing
description: How to contribute to evlog, covering commit and PR conventions, changesets, the Definition of Done, testing rules, and the authored skills that walk through building a new adapter, enricher, framework integration, or map rule. Load this for any question about contributing, opening a PR, or adding something to the package.
---

# Contributing to evlog

The repository's own `AGENTS.md` is the source of truth for all of this. It changes; this skill does not restate it in full on purpose. **Read `AGENTS.md` from the repo before giving specifics.**

Your system context has a **Workspace** section saying whether the repository is checked out on this turn. With a checkout, `read_file /workspace/AGENTS.md`: free, and at the ref you were summoned on. Without one, `github__getFileContent` on `AGENTS.md` at the root of `HugoRCD/evlog`.

What follows is the shape of the answer, so you know what to look for and what to warn about.

## The parts people get wrong

- **A changeset is required** for anything a consumer of evlog would notice: a feature, a bug fix, a breaking change. `pnpm changeset`, committed alongside the code. Changes confined to `apps/*` or `examples/*` never need one. A PR without a changeset for a user-facing change does not merge.
- **Conventional Commits, lowercase subject.** `feat: add stream server`, not `feat: Add stream server`. Omit the scope when the change is cross-cutting; never use `evlog` as a scope. A new subsystem needs its scope registered in both `.github/workflows/semantic-pull-request.yml` and `.github/pull_request_template.md`, and because title validation reads the base branch, that registration has to land in an earlier PR.
- **A bug fix needs a failing regression test first**, then the fix.
- **New exports** go in `packages/evlog/package.json` (`exports` and `typesVersions`) *and* `tsdown.config.ts`.
- **Skills must stay in sync.** If a change touches something a skill documents, the SKILL.md changes in the same PR, both the internal `.agents/skills/` and the published `apps/docs/skills/`.

## The Definition of Done

`AGENTS.md` lists eight conditions. The ones worth repeating up front: `pnpm run lint`, `pnpm run typecheck` and `pnpm run test` all exit 0; the change has a matching test; new public APIs have JSDoc.

## Authored procedures in the repo

For anything substantial, the repo already has a step-by-step skill. Read the relevant one with `github__getFileContent` rather than improvising:

| Task | Skill |
| --- | --- |
| New drain adapter | `.agents/skills/create-adapter/SKILL.md` |
| New enricher | `.agents/skills/create-enricher/SKILL.md` |
| New framework integration | `.agents/skills/create-framework-integration/SKILL.md` |
| New `evlog map` rule or framework adapter | `.agents/skills/create-map-rule/SKILL.md` |

Each covers source, build config, package exports, tests, and every doc page that has to move with it. They are long and specific; point people at them and read the relevant section rather than summarizing from memory. On a GitHub turn they are on disk under `/workspace/.agents/skills/`.

## Verifying a change before you propose it

The sandbox has `git`, `node` and `pnpm`, and on a GitHub turn it holds the repository. When you have written or edited code, run the checks rather than asserting they pass:

```
pnpm install --frozen-lockfile   # once per session, it is not preinstalled
pnpm run lint
pnpm run typecheck
pnpm --filter evlog exec vitest run test/path/to/file
```

The install is slow and needs network, so only pay for it when you are actually changing code, never to answer a question. If you could not run the checks, say so plainly in the pull request body instead of implying a green build.

`pnpm --filter @evlog/cli exec evlog map --json --no-write` scores an entry point's observability and is built for exactly this: it is the fastest way to ground a "should this be logged" answer in the tree you are working in. Run the workspace copy rather than `npx @evlog/cli`, which would fetch and execute whatever version the registry currently serves.

## Tests

`packages/evlog/test/` mirrors `src/` and uses Vitest. `packages/evlog/test/README.md` has the file layout, the framework runtime fidelity matrix, and the helper decision table; read it before answering a testing question. Framework tests must drive the framework's real request driver (supertest, `app.inject`, `app.handle`, ...), never a hand-rolled stand-in.

## Style

The repo has an explicit "no slop" section: no defensive code the surrounding file does not have, no silent fallbacks, no `as any`, comments only for constraints the code cannot express, no speculative options. It applies to prose too: test names, error messages, changeset descriptions, PR bodies. Factual and plain.
