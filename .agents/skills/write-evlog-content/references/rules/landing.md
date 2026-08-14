# Landing rules

Apply to `apps/docs/content/0.landing.md` and any other page whose job is to convert rather than to instruct.

The landing page is the surface where AI-generated prose is hardest to distinguish from marketing prose, because the failure mode is the same: a sentence that sounds like value and names nothing. Judge it harder here, not more leniently.

---

**L-01 · Every claim maps to a page that keeps it** · `critical`

Rule: each feature card, headline, and benefit line corresponds to a documented capability, and the card links to the page that proves it. A promise with no page behind it is the most expensive defect on the site.
Why: the landing page sets the expectation the docs are then measured against.

---

**L-02 · A headline names a capability or a consequence** · `standard`

Rule: headlines say what the reader gets or what stops happening, not what the product is.
Bad: "Powerful, flexible logging for modern applications"
Better: "Set context. Get answers" / "One command. Every blind spot"
Why: the existing landing headlines work because each one is a small before and after. The ones that drift are the ones that describe the product instead.

---

**L-03 · The description under a headline carries the mechanism** · `standard`

Rule: a card headline can be compressed. The description under it names the actual thing: the API call, the number, the failure it prevents.
Bad: "Send your logs anywhere with our powerful and flexible pipeline."
Better: "Batched writes, automatic retries with backoff, and fan-out to multiple destinations. Your logs flow through a pipeline that never blocks your response."
Why: the headline earns attention, the description earns belief, and a description that only restates the headline wastes the one place a technical reader looks.

---

**L-04 · No superlative without a number** · `critical`

Rule: `fastest`, `most complete`, `zero overhead`, `blazing`, `effortless` require a measurement and a link. Without one, cut the word rather than soften it.
Why: an unbacked superlative on a landing page is read as a lie by exactly the audience evlog is for.

---

**L-05 · The rhythm is a design decision, and it is finite** · `standard`

Rule: the landing uses fragments, two-beat lines, and `:br` breaks on purpose. Each one must land a distinct capability. Two cards using the same rhythmic device to say a similar thing is one card too many.
Why: this is the surface where the AI-tell list and the house style overlap most, and density is what separates them.

---

**L-06 · Landing copy changes are proposals, not sweeps** · `critical`

Rule: an automated pass reports findings on the landing page and does not rewrite it unless a finding is `critical`: a broken promise, a dead link, a claim the source contradicts. Voice and rhythm findings here go to a human.
Why: the landing carries brand decisions that are not written down anywhere a reviewer can read, and a rewriter with no access to them will regress them confidently.
