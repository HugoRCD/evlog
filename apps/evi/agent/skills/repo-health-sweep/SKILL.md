---
name: repo-health-sweep
description: Bi-weekly pass over the whole evlog repository, not just the agent's own surface. Checks every SKILL.md against the real package surface, the docs tree for stale or self-contradictory pages, the repo's own conventions, and the examples against the current API. Load this when the repo-health-sweep schedule fires, or when Hugo asks for a repo health sweep, a docs audit, a skills-vs-reality check, or a convention drift review.
---

# Repo health sweep

The self-review owns the agent's own surface. This sweep owns the rest of the
repository: the published docs, the skills that describe the package, the
repo's own conventions, and the runnable examples. Where they overlap, this
skill covers the parts the self-review does not.

The failure mode is the same as self-review: a confident claim that is quietly
out of date, and the expensive version is claiming something does not exist.
Every check in this sweep is grounded in the current `main` before it is
written down. This is the `source-research` procedure over the whole repo, not
anything recalled.

## The rule that never bends

A finding names the file and the rule or source it contradicts, or it is
dropped. A claim that an option, export, adapter or page is missing is proven
by enumerating the real surface, never by the absence of a memory. Load
`source-research` and follow it before drawing a conclusion about any package
behavior.

## The four lenses

### Skills vs reality

Every SKILL.md, internal and published, checked against the package surface it
describes.

- Internal: `.agents/skills/*` (create-adapter, create-enricher,
  create-framework-integration, create-map-rule) and `apps/evi/agent/skills/*`.
- Published: `skills/*` (analyze-logs, build-audit-logs,
  review-logging-patterns).
- What to check: every API name, option, default, or adapter the skill shows.
  An `evlog.X` option must exist under that name; a function signature must be
  the real one (a curried call shown where the API is two-arg is a bug); a
  framework must export what the skill claims it does or does not.
- Bar: a skill that describes old behavior is worse than no skill (`AGENTS.md`).
  When a code change fixed a skill in this repo, that fix is the evidence the
  skill used to drift.

### Docs quality

The published docs are the contract, so a wrong page costs real users.

- Pages that are unclear, stale, or inconsistent with each other. A page that
  contradicts a sibling page about the same API is a finding even when both are
  wrong the same way.
- A feature that shipped without a docs page, or an option documented with the
  wrong default.
- A table (adapters, env vars, exports, flags) that lists sources the code does
  not read, or omits ones it does. Cross-check against source, not against an
  older page.
- Anything `source-research` could not answer because no page covers it.

### Convention drift

Places where the code or prose violates the repo's own rules.

- Root `AGENTS.md`: export registration in all three of `package.json#exports`,
  `package.json#typesVersions`, `tsdown.config.ts`; no `evlog/shared` import
  (`evlog/toolkit` is the public name); the style rules ("no as any", no silent
  fallbacks, no speculative options) applied to new code.
- Changeset policy: a user-facing change merged with no changeset, or a
  changeset shipped for a change confined to `apps/*`.
- Test placement: logic under `agent/` or `packages/*/src` with no colocated
  test, or the repo's testing rules (framework tests driving the real request
  driver) violated.
- Consistency with its own stated convention, including the ones in `AGENTS.md`
  that the prose itself breaks.

### Examples drift

`examples/*` must match the current API. The examples are the first thing a
user reads after the docs.

- A runnable example importing an option, export or signature that no longer
  exists, or relying on a default that changed.
- A skeleton directory (the `community-*-skeleton` dirs used by the create-*
  skills) that no longer matches what the skill generates.

## Grounding

- **Run before you assert.** Anything you claim about the package surface is
  executed in `/workspace/repo` on `main` or read from source. If it could not
  be verified, it is written as a question, never as evidence in a PR body.
- **Absence is proven by listing.** Enumerate the exports map, the docs index,
  the adapters directory, the connect registry before calling something
  missing.
- **One counter-example kills a finding.** Grep the whole repo, not the
  directory you were reading.

## Dedupe

Before filing anything: `linear__list_issues` on the evlog team, and
`github__searchIssues` for an open issue, PR or draft on the same ground,
including your own earlier runs. A stale draft that still applies gets a rebase
and a comment, not a replacement. A finding Hugo closed once does not come
back.

## Deliver

One report with concrete findings, each citing the file and the rule or source
it contradicts, plus proposed diffs for the easy ones. The report is the
deliverable; it goes to a Linear document, with a summary comment on the issue.

- **Mechanical fix, checks green, no judgement needed → draft PR.** One per
  finding, never bundled. Follow `contributing`: branch off `main`,
  `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`. An `apps/evi` or
  `apps/docs` content change never needs a changeset; a change to a published
  package does.
- **Everything else → Linear issue** via `linear__save_issue` on the evlog
  team, or a proposal in the report when it is a decision rather than a fix.
  Name the problem, what it contradicts, where it is, and the decision to make.
- **A proposal never ships as code on your own initiative.** The report is the
  deliverable; building it is Hugo's call.

Post one line per artifact to the thread, links inline.

## When nothing is warranted

One line: the lenses ran and nothing came up. Never invent a finding to fill
the run, never file an issue to report that a lens was clean, and never open a
PR for a rule the repo does not actually state.
