# AI tells in evlog content

The patterns that make prose read machine-written, calibrated on evlog's own surfaces.

Three things to hold before using this list.

**No single item proves anything.** Every tell here appears in good human writing. What separates a habit from a tic is how often it fires and whether the sentence it produced carries anything. One hollow word in two thousand is noise.

**Every tell has a lawful twin.** evlog documents an API. A list of three drains is not a rule of three, it is three drains. A sentence saying which option is required and which is optional is not a rhetorical inversion, it is a parameter reference doing its job. Each entry below names the twin. A candidate that sits nearer the twin is dropped, silently, with no finding.

**A shape is not a tell.** Several patterns here are also ordinary technical writing, and the test that separates them is always the same: does the sentence deliver a fact, a number, a mechanism, or a decision? A short closing line that lands a measurement is voice. The same line restating the paragraph above it is a tell.

The scanner (`scripts/content-lint`) surfaces candidates for T-01, T-03, T-04, T-06, T-07, T-08, T-09, T-11, T-12, T-13 and T-15, plus the U-14 punctuation rule. The rest are yours to judge.

---

## T-01 · Hollow superlative

A quality word doing the work a fact should do.

Watch for: seamless, effortless, powerful, robust, comprehensive, blazing, lightning-fast, cutting-edge, game-changing, revolutionary, next-level, world-class, incredibly, extremely, virtually, simply, elegant.

**Reads generated**: "evlog gives you a powerful and flexible logging pipeline with comprehensive support for modern runtimes."
**Reads legitimate**: "The pipeline batches, retries with backoff, and fans out to several destinations without blocking the response." Same claim, named mechanisms.
**Twin**: a quality word attached to a measurement or a mechanism. "2.4x faster than pino on the bench" is a claim. So is "robust to a drain that returns 500, because the batch is retried and then dropped after the configured attempts", where `robust` is glossed by the clause after it.

---

## T-02 · Rule of three as decoration

Three items where three carry no more than two, matched in length and rhythm.

**Reads generated**: "evlog brings clarity, confidence, and control to your logs."
**Reads legitimate**: "Head sampling drops by level, tail sampling rescues errors and slow requests." Two, because there are two.
**Twin, and it is common here**: the set has three members. Three sampling tiers, three exports, three lifecycle hooks. When the triad is the API, listing it is the content. Check the source before flagging: if `packages/evlog/src` has exactly those three, drop the finding.

---

## T-03 · Epigram density

Nearly every paragraph closing on a compressed, quotable line.

**Reads generated**: a page where six paragraphs in a row end on "Configure once, scale forever." / "Structure is the difference." / "That is the whole idea."
**Reads legitimate**: one such line, landing the section's actual consequence, in a page that otherwise ends its paragraphs on ordinary sentences.
**Twin**: a closer carrying a number, a symbol, or a link is doing work. The tell is the *rate*, and only when the lines restate rather than deliver. Count them before writing the finding, and report one page-level finding with the count, never six line findings.

---

## T-04 · Not just X, it is Y

The template and its family: "not only X but also Y", "X isn't a Y, it's a Z", "it's not about X, it's about Y".

**Reads generated**: "evlog isn't just a logger, it's an observability layer."
**Reads legitimate**: a genuine correction of a wrong assumption the reader is likely holding, stated once, where the contrast is the information. "`log.set` does not write a line. It stages a field on the event that flushes when the request ends."
**Twin**: the second example is a real distinction with a mechanism on both sides. The tell is the version where X and Y are the same thing at two levels of grandeur.

---

## T-06 · One-mould headings

Every heading on a page cut to the same grammatical shape: all imperatives, all noun phrases, all full declarative sentences.

**Reads generated**: three headings, one machine. "The logs stopped answering questions" / "The pipeline absorbed the retries" / "The context was the missing half".
**Reads legitimate**: a reference page where every heading is an API symbol (`## defineErrorCatalog`, `## defineAuditCatalog`), or an ordered guide where every heading is the step's imperative. Both are parallel because the content is parallel.
**Twin**: parallel API, parallel headings. The tell is uniformity imposed on content that is not uniform, such as a page mixing concept, configuration, and troubleshooting whose headings all read as declarative sentences.

Note on this corpus: most evlog reference pages are all-noun and that is correct for them. Weigh this tell on pages that argue rather than enumerate.

The scanner subtracts two twins before it reports anything, so a candidate that reaches you has already survived both:

- **The section's shared shape.** Headings a page has in common with three or more of its siblings are the directory's template, not this page's mould. The adapter pages all carry Installation, Quick Start, Configuration and Troubleshooting because a reader comparing two of them wants the same section twice.
- **A numbered sequence.** `1. Route filtering`, `2. Logger creation`, `3. Emit` are the steps of one procedure. They share a shape because they are one thing, which is the ordered guide named above.

---

## T-07 · One-frame bullets

Every bullet in a list built on the same syntactic frame, usually opening on the same word.

**Reads generated**: "Fast builds, because... Fast tests, because... Fast deploys, because..."
**Reads legitimate**: an options list where each bullet is `` `option` `` followed by type, default, and effect. Parallel because it is a table in bullet form.
**Twin**: see D-07. If the frame is a table, the fix is a table, not a rewrite of the bullets.

---

## T-08 · Throat-clearing and mechanism hedges

Filler openers, and hedges attached to deterministic behavior.

Watch for: it's important to note, it's worth noting, keep in mind that, that being said, with that in mind, in conclusion, in summary, overall, furthermore, moreover, additionally, ultimately, at the end of the day, let's dive in, let's explore.
And: often, typically, generally, in most cases, usually, may, can sometimes, on behavior the code decides.

**Reads generated**: "It's important to note that redaction generally masks emails before they reach a drain."
**Reads legitimate**: "On Cloudflare Workers, `useLogger()` depends on the `nodejs_als` flag, so behavior varies by deployment config." The hedge names what varies and why.
**Twin**: a hedge on genuine variance is precision. See U-07.

---

## T-09 · Universal opener

Opening on something true of everyone, then narrowing to the subject.

**Reads generated**: "Every application produces logs. But not all logs are useful." / "In modern distributed systems, observability has become essential."
**Reads legitimate**: "By the time you have 200 routes, 40 background jobs, and a `console.log` per file, you're paying interest on a decision you never made." General in shape, but it names quantities and a cost.
**Twin**: a general opener that carries specifics. The tell is the version that could open a page about anything.

---

## T-11 · Register seam

Contraction density jumping between adjacent sections. A run of "you don't" against a run of "you do not", which is what two authors, or one author and one model, leave behind when their passages are stitched together.

**Reads generated**: a page whose middle three paragraphs suddenly stop contracting while the rest of the page contracts throughout.
**Reads legitimate**: a page that is uniformly formal, or uniformly casual. Register itself is not the tell; the seam is.
**Twin**: a reference page that avoids contractions everywhere is consistent, and consistency is the opposite of this tell.

---

## T-12 · Metronome rhythm

Uniform paragraph lengths and uniform sentence lengths across a whole page, with no passage that runs long because the idea needed room and none that stops short.

**Reads generated**: twelve paragraphs, each three sentences, each sentence roughly the same length.
**Reads legitimate**: a reference page whose entries are uniform because the entries are uniform.
**Twin**: uniformity that mirrors uniform content. The tell is uniformity imposed on an argument, which always has uneven parts.

---

## T-13 · Assistant framing

The conversational register of a chat reply.

Watch for: Great question, Certainly, Absolutely, I hope this helps, Let me know if, Here's a breakdown, Let's break it down, In this guide we will explore, By the end of this article you will.

**Reads generated**: any of them, in docs prose. There is no twin. Flag every occurrence.
**Exception**: inside a `::prompt` block, where the text is a prompt written for an agent and the register belongs to that genre.

---

## T-14 · Undemonstrated claim

A paragraph asserting how the system behaves with no code, no number, and no link anywhere near it.

**Reads generated**: a section explaining that evlog handles high-throughput workloads efficiently, followed by another paragraph of the same, followed by a heading.
**Reads legitimate**: a claim followed within a screen by the snippet, the bench figure, or the page that demonstrates it.
**Twin**: conceptual passages that exist to frame a decision ("wide events trade one write per statement for one write per operation") legitimately carry no code. The tell is an *unframed* behavioral claim, something the reader would need to verify and cannot.
**Note**: this is the most valuable tell in this file and the scanner can only approximate it. Judge it yourself, per section, on pages the scanner ranks low.

---

## T-15 · Phantom API

A symbol in backticks that does not exist in `packages/evlog/src`, or an import path that is not in `package.json#exports`.

Deterministic and always `critical`. The scanner reports candidates; verify each against the source before writing the finding, because prose in backticks (`user.id`, a field name, a config key from another tool) will produce false hits.
**Most common real cases**: `evlog/shared` where the public entry point is `evlog/toolkit`, `evlog/browser` where it is now `evlog/http`, and options renamed in a minor release whose docs page was not in the PR.
**Twin**: a page documenting the deprecation itself names the retired path on purpose. The scanner already drops those; keep the same rule when you judge one by hand.

---

## Punctuation is a rule, not a tell

Em dashes and en dashes are banned in evlog prose by `U-14`, so they never appear here as a judgment call. The scanner reports every occurrence and the fix is a comma, a colon, or two sentences. Semicolon and parenthetical density is still worth a look on a page that reads breathless, but it is a craft note rather than a tell.

---

## Corpus-level tells

Only visible across pages, so they belong to a batch run rather than a page review.

- The same sentence, or a five-word span of it, appearing on several pages that were drafted together. Real duplication of a warning is fine; duplicated *framing* is the tell.
- The same worked example (`checkout`, `userId: 42`) recurring across unrelated pages, which makes the docs read as one generated set rather than pages written for their own reader.
- Every page in a section opening on the same move.

---

## Where this list comes from

The vocabulary and framing tells are the public research on machine-written prose: Wikipedia's "Signs of AI writing", the word-frequency work published by Grammarly and others, and the reports developers keep publishing about their assistants' tics. That material is generic. What is evlog-specific, and what actually decides a finding, is the twin attached to each entry: those come from reading this corpus, and they are the reason a parameter table does not get flagged for looking parallel.

Tells get removed from this file when the corpus shows they only produce their own false positives. One already has.
