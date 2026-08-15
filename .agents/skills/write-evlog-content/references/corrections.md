# Corrections

Lessons from rewrites that were rejected, and from findings that turned out to be wrong. This file grows; nothing else in the skill does.

Add an entry when a review flags something that should have passed, when a rewrite regressed a page, or when the maintainer overrides a rule. One entry, four lines, no narrative.

```
## <date> · <rule or tell id> · <one-line title>
Flagged: what the review said.
Actual: why it was wrong, or what the maintainer wanted instead.
Applies to: the surfaces or pages this holds for.
```

An entry that repeats itself three times is a rule that needs changing, not a correction that needs restating.

---

## 2026-08-15 · T-06 · A shared template is not a mould

Flagged: 51 pages, "all N headings are noun". The adapter and framework pages carry Installation, Quick Start, Configuration, Troubleshooting and Next Steps by design.
Actual: a page set written to one shape is not a page written from a mould. A reader comparing Axiom and Datadog wants to land on the same section twice, and 14 of those headings are linked by anchor from elsewhere in the docs.
Applies to: any directory of sibling pages. `scripts/content-lint/lib/score.mjs` now subtracts the headings a page shares with three or more siblings before judging the shape of what is left, which took the finding count from 51 to 47. The 47 that remain each have ten or more headings of their own, all nouns, and those are real.

## 2026-08-15 · T-06 · A numbered sequence is not a mould

Flagged: pages whose headings read `1. Route filtering`, `2. Logger creation`, `3. Emit`.
Actual: the steps of one procedure share a shape because they are one procedure. `ai-tells.md` already named the ordered guide as the twin; the scanner did not know it.
Applies to: any heading opening with a number or `Step N`. `metrics.mjs` classifies those as `sequence` and `T-06` ignores that shape, which took the count from 44 to 35.

## 2026-08-15 · U-14 · Punctuation is never mechanical

Flagged: a codemod replacing `A — B — C` with `A, B, C`.
Actual: 25 of 38 replacements turned a parenthetical list into a sentence whose subject was followed by four bare nouns. The correct mark depends on whether the dashed span is an appositive, a list, a cause, or a second thought, and only a reader can tell.
Applies to: every surface. The rule now ranks the replacements and the codemod does not touch punctuation at all.
