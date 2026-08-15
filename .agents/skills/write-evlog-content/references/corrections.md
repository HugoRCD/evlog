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

## 2026-08-15 · T-07 · Four bullets is not enough to see a mould

Flagged: four lists, all four lawful. Controlled variables on the benchmark page (`Same output mode`, `Same warmup`, `Same tooling`, `Same machine`), a decision matrix (`Pick evlog over pino`, `over winston`, `over consola`, `Stay on pino`), a pitfalls list, and a list of example consumers.
Actual: at four items a 75% share is three bullets, which is what parallel content looks like when it is doing its job. The tell is uniformity imposed on content that is not uniform, and four items cannot show that.
Applies to: every surface. `score.mjs` now needs five items. Two other openers were leaving by construction rather than by voice and are stripped first: an ordinal in a numbered list, and the `code` placeholder a symbol or a code-labelled link leaves behind.

## 2026-08-15 · U-15 · A codemod rewrote the rule that defines it

Flagged: nothing. This was found by reading.
Actual: the corpus-wide `--fix` sweep replaced `sink` with `drain` inside `terminology.md` itself, so the table of words to avoid listed `drain`, and `universal.md`'s worked pair read `Bad: "Register the drain"`. The rule told a reviewer to reject the correct word.
Applies to: any codemod. `corpusFiles` already excludes this directory, and the guard that enforces it landed after that sweep ran. Never point `--fix` at a path by hand; pass the corpus and let the exclusions do their job.

## 2026-08-15 · U-15 · `transport` is not evlog's word to reclaim

Flagged: 13 pages using `transport`.
Actual: all 13 were lawful. pino's transports in a migration section, the HTTP transport that carries browser logs, HyperDX's own exporter, and `not a transport` meaning "not a delivery mechanism". The rule cannot tell evlog's drain from the transport layer by reading one line.
Applies to: the scanner only. `terminology.md` still prefers `drain`, and a reviewer should still say so. `sink` and `exporter` stay in the table, since neither has a lawful second meaning here.

## 2026-08-15 · T-03 · A closer ending on a colon introduces something

Flagged: `Never log:`, `This enables:`, `In the Sentry dashboard:`.
Actual: a short final sentence ending on a colon is the sentence of the table or list below it, not a flourish. Six of eight candidates were this.
Applies to: every surface. `metrics.mjs` no longer counts a closer that ends on a colon.

## 2026-08-15 · T-06 · A numbered sequence is not a mould

Flagged: pages whose headings read `1. Route filtering`, `2. Logger creation`, `3. Emit`.
Actual: the steps of one procedure share a shape because they are one procedure. `ai-tells.md` already named the ordered guide as the twin; the scanner did not know it.
Applies to: any heading opening with a number or `Step N`. `metrics.mjs` classifies those as `sequence` and `T-06` ignores that shape, which took the count from 44 to 35.

## 2026-08-15 · U-14 · Punctuation is never mechanical

Flagged: a codemod replacing `A — B — C` with `A, B, C`.
Actual: 25 of 38 replacements turned a parenthetical list into a sentence whose subject was followed by four bare nouns. The correct mark depends on whether the dashed span is an appositive, a list, a cause, or a second thought, and only a reader can tell.
Applies to: every surface. The rule now ranks the replacements and the codemod does not touch punctuation at all.
