---
name: source-research
description: Retrieve and cite evlog facts from the documentation and the repository source. Load this before calling any docs or code-search tool for research; it defines how to find the right page, when to escalate from docs to source, and how to cite what you found.
---

# Source research

Follow this whenever you need a fact about evlog. The goal is a grounded, cited answer in as few tool calls as possible.

## The docs are a list-then-read corpus

There is no keyword search. `docs__list-pages` returns every page with its title, path and description; `docs__get-page` returns one page's markdown and its canonical URL.

1. **Call `docs__list-pages` once per session.** It returns the whole index and is cached for an hour. Keep the result in mind for the rest of the conversation; do not call it again.
2. **Pick candidates from titles and descriptions.** The index is small enough to scan. Sections map to what they cover:

   | Prefix | Covers |
   | --- | --- |
   | `/start` | introduction, installation, quick start |
   | `/learn` | wide events, structured errors, lifecycle, sampling, redaction, typed fields, catalogs |
   | `/cli` | `init`, `map`, rules, scoring, CI, `doctor`, telemetry, agents |
   | `/integrate` | framework integrations and drain adapters |
   | `/use-cases` | client logging, enrichers, AI SDK, Better Auth, audit, telemetry, eve |
   | `/extend` | custom drains, enrichers, frameworks, plugins, tail sampling, the stream |
   | `/reference` | configuration, performance, best practices, comparisons, agent skills |

3. **Call `docs__get-page` on one to three pages.** Not more. If three pages do not answer it, the question is probably not a docs question; go to step "Escalating to source".
4. **Answer from the returned markdown**, citing the `url` field the tool gave you.

If nothing in the index looks right, try one reformulation against the index before concluding the docs do not cover it.

## Escalating to source

Go to the repository when the docs do not settle the question, or when the question is inherently about implementation: why something behaves the way it does, what a function actually emits, whether an edge case is handled.

Your system context has a **Workspace** section saying whether the repository is checked out at `/workspace` on this turn. Follow it rather than probing: a `read_file` against a checkout that is not there costs a step and tells you nothing you were not already told.

**With a checkout**, read it directly. `grep` and `glob` beat GitHub code search on every axis: real regular expressions, no indexing lag, and the tree is the one under discussion rather than the default branch.

Paths must be absolute: `glob`, `grep` and `read_file` reject a repo-relative
path outright, so always write the `/workspace/` prefix:

```
glob "/workspace/packages/evlog/src/adapters/*.ts"
grep "createFsDrain" --glob "/workspace/packages/evlog/src/**"
read_file /workspace/packages/evlog/src/eve/index.ts
```

**Without one**, go through the API:

- `github__searchCode` with `repo:HugoRCD/evlog` and a distinctive symbol or string. Search for identifiers, not prose; GitHub code search does not do natural language.
- `github__getFileContent` once you have a path. Prefer reading one file over searching repeatedly.

Use `github__getBlame` for "when did this change" or "why is this like this" either way: the checkout is shallow, so a local `git log` will not answer it.

Useful paths when you already know roughly where to look:

- `packages/evlog/src/`: the main package. One directory per framework integration, plus `adapters/`, `enrichers/`, `shared/` (published as `evlog/toolkit`), `runtime/`, `nuxt/`, `nitro/`, `vite/`, `ai/`, `eve/`.
- `packages/cli/src/commands/`: the CLI.
- `packages/evlog/test/`: mirrors `src/`; the tests are often the clearest statement of intended behavior.
- `examples/`: one runnable example per framework.

Source answers a question about *the current code*. When the docs and the code disagree, say so explicitly and cite both; that is a real finding, not something to smooth over.

## Checking GitHub first for bug reports

When someone reports something broken, search issues before explaining anything. An existing thread is a better answer than a fresh diagnosis. Only if nothing matches do you investigate from docs or source.

## Citing

- Docs claim → the `url` returned by `docs__get-page`. Never assemble a URL yourself; section numbers change as pages are added.
- Source claim → the repo-relative file path, plus the symbol when it helps.
- Issue or PR → the number, linked.
- One citation per distinct claim. A short answer needs one link, not a bibliography.

## Reporting a gap

If retrieval genuinely comes up empty, say what you searched and where, and stop. Do not fall back on your own knowledge of evlog to fill it in. A gap is useful information: it often means the docs need a page, which is worth mentioning.
