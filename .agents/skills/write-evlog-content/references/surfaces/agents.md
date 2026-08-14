# Surface: AGENTS.md

Three files, nested on purpose: `AGENTS.md` at the root, `apps/docs/AGENTS.md`, `apps/evi/AGENTS.md`. The root file is symlinked from `CLAUDE.md`, so an edit there lands in both. A nested file holds what is true of its directory and nothing that belongs at the root.

## What it owes its reader

An agent that is about to change this repository and has read nothing else. It owes the commands, the conventions, the definition of done, and the boundaries, in a form that survives being the only thing in context.

The root file says of itself that it is living documentation. That is the contract the pass enforces: a command that no longer exists, a path that moved, a workflow that is not real, is a critical finding, not a style note.

## Rules that bite here

- **M-07** above all. This is the file most likely to describe last quarter's repository.
- **M-04**: the Boundaries section is the reason the file works. A rewrite that softens "never" into "avoid" has changed behavior.
- **M-09**: procedure and boundaries go to the maintainer. Punctuation, dead links, and stale paths the pass verified can be fixed in place.
- **U-14** applies here too. These files are prose about how to write prose, and they are read more often than any docs page.

## What a content pass checks

- Every command in the Commands block exists in the matching `package.json`.
- Every path in the layout block exists on disk.
- Every skill named at `.agents/skills/` is there, and every skill there is named.
- Growth. The root file's own instruction is that a correction is a few lines, not a rewrite. A file that gained a section per month is the finding.

## What it never becomes

Documentation. When a section here explains something rather than deciding it, that section belongs in the docs and the file keeps a link. This is the failure mode of every long-lived agent instruction file, and the root one is already 1600 words.
