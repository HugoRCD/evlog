# Universal rules

Apply to every evlog surface. Each rule has an id used in findings, a severity, and a worked pair.

---

**U-01 · The reader is `you`** · `standard`

Rule: address the reader in the second person and keep the system as the subject of its own verbs.
Bad: "Context can be accumulated over the lifetime of a request, and an event is emitted at the end."
Better: "You accumulate context over the request. evlog emits one event when it ends."
Why: passive voice hides who acts, and in a logging library the answer, you or the framework integration, is the whole point.

---

**U-02 · An abstraction is never the actor** · `standard`

Rule: the subject of a sentence is a person, a process, or a named part of the system. Not a quality, a concept, or a benefit.
Bad: "Observability becomes achievable once structure is in place."
Better: "Once every handler emits a wide event, you can query the field instead of grepping the line."
Why: abstract subjects let a sentence assert progress without naming what changed.

---

**U-03 · Present tense for behavior that exists** · `standard`

Rule: describe shipped behavior in the present indicative. Reserve future tense for something genuinely not built.
Bad: "The adapter will retry failed batches with exponential backoff."
Better: "The adapter retries failed batches with exponential backoff."
Why: future tense on shipped behavior reads as a roadmap and makes the reader unsure what they get today.

---

**U-04 · Every claim names its mechanism, number, or page** · `critical`

Rule: a statement about behavior or performance carries what makes it true: the mechanism, a measured number with its source, or a link to the page that demonstrates it.
Bad: "evlog is extremely fast and adds virtually no overhead."
Better: "Emitting a wide event costs one object merge and one serialization at flush time. See [Performance](/reference/performance) for the bench numbers."
Why: an unbacked claim is the fastest way to lose a technical reader, and it is the one thing they cannot verify without leaving.

---

**U-05 · Open on the reader's situation, not the topic** · `standard`

Rule: the first sentence describes where the reader is or what it is costing them. Definitions come after.
Bad: "Sampling is a technique used to reduce the volume of telemetry data."
Better: "Your log bill scales with traffic, and 98% of those events are successful requests nobody will read."
Why: a definitional opener asks the reader to care before giving them a reason to.

---

**U-06 · One proposition per sentence** · `standard`

Rule: a sentence carries one claim. If half of it restates the other half, cut that half.
Bad: "The pipeline batches events before sending them, which means events are grouped together rather than sent one by one."
Better: "The pipeline batches events before sending them."
Why: restatement is the most common filler in generated prose, and it survives a read because both halves are true.

---

**U-07 · Hedge only genuine uncertainty** · `critical`

Rule: `often`, `typically`, `generally`, `in most cases`, `may` belong on things that actually vary: runtime, framework, user configuration. Never on deterministic behavior.
Bad: "Redaction generally masks emails before they reach a drain."
Better: "Redaction masks emails before they reach a drain." Or, where something really does vary: "On Workers without `nodejs_als`, `useLogger()` is unavailable, so the integration passes the logger as the fourth argument instead."
Why: a hedge on a guarantee makes the reader defensively re-implement the guarantee.

---

**U-08 · Name links by their destination** · `standard`

Rule: link text says where it goes. No "click here", "see the docs", "this page", "read more".
Bad: "For more information about draining, see [here](/integrate/adapters/overview)."
Better: "See [drain adapters](/integrate/adapters/overview) for the full list."
Why: link text is scanned, not read in sequence.

---

**U-09 · No decorative punctuation or emoji in prose** · `standard`

Rule: no emoji, no exclamation marks, no bold used for emphasis on a whole sentence. Bold marks a term the reader will look for again.
Why: emphasis that is everywhere marks nothing, and emoji in reference prose reads as filler.

---

**U-10 · Code samples are runnable and current** · `critical`

Rule: imports resolve, symbols exist in `packages/evlog/src`, the entry point is the public one (`evlog/toolkit`, never `evlog/shared`), and the sample compiles against the API as it stands today.
Why: a sample the reader pastes and cannot run costs more trust than the page bought.

---

**U-11 · Headings say what the section does for the reader** · `standard`

Rule: a heading names the question answered or the thing achieved, rather than a noun label that says less.
Bad: "## Configuration"
Better: "## Choose what reaches the drain"
Why: headings are the table of contents the reader actually reads, and a page of noun labels forces a linear read.
Exception: reference pages where the heading is the API symbol. `## defineErrorCatalog` is the right heading.

---

**U-12 · Comparisons stay accurate about the alternative** · `critical`

Rule: when naming pino, winston, consola, or any other tool, describe what it actually does today and link the claim. Never compare against a weakness it fixed. The facts live in `references/landscape/`, one file per tool; a claim that is not in the dossier is unverified and does not ship.
Bad: "Unlike pino, evlog does not make you assemble transports by hand."
Better: "pino writes through a transport you assemble ([transports](https://getpino.io/#/docs/transports)). evlog ships the adapter and the pipeline that batches and retries it."
Why: one unfair comparison invalidates the whole page for the reader who knows the other tool, and they are the reader the page is written for.
Note: the scanner raises a candidate for any comparative sentence naming a tool with no number and no link on the line. It cannot tell you the claim is wrong, only that nothing backs it.

---

**U-13 · Say what it costs** · `standard`

Rule: where a feature has a price, a flag, a dependency, a runtime constraint, a field to maintain, or a performance trade, the page names it next to the feature rather than in a footnote.
Why: the admission is what makes the rest of the page believable, and evlog's constraints (`nodejs_als` on Workers, the drain's async boundary) are things readers hit anyway.

---

**U-14 · No em dashes, no en dashes** · `standard`

Rule: no `—` and no `–` in prose, in any language, on any surface. Hyphens in compound words are fine, and so are dashes inside code blocks and inside a verbatim quote.
Bad: "The drain batches events, then retries with backoff, before it gives up."  written as "The drain batches events — then retries with backoff — before it gives up."
Better: "The drain batches events, retries with backoff, then gives up."
Why: this is a maintainer decision about how evlog sounds, and it is the punctuation most associated with machine-written prose. Every occurrence is a finding, and there is no density threshold to argue about.

**What replaces it**, in the order to try:

1. **A comma**, when the clause continues the sentence. "the integration path for oRPC v1, and it remains the entrypoint".
2. **A period**, when the second half is its own thought. Two short sentences beat one hinged sentence.
3. **A colon**, when the second half explains or lists what the first half named.
4. **Nothing**, when the dash was joining two things that did not need joining. Cutting is a valid fix and the only one that cannot introduce a new tell.

**Never a semicolon.** It is not in this register, it reads as a writer who could not choose between a comma and a period, and swapping one unusual mark for another leaves the sentence exactly as stiff as it was. A replacement that a reader would notice is not a fix.

**No codemod touches this rule**, and the reason is worth keeping. Replacing a dashed pair with commas was tried across this corpus: 25 of 38 replacements turned a parenthetical list into a sentence whose subject was followed by four bare nouns. "It finds every entry point, API handlers, pages that fetch, middleware, checks each one" is not a fix, and the scanner cannot tell that span from an appositive. Which mark belongs here is a reading, so every dash arrives as a finding.
Note: the corpus predates the rule, so most pages still carry them. A content pass removes the ones on the pages it touches and does not open a PR just to sweep them.

---

**U-15 · evlog's parts keep evlog's names** · `standard`

Rule: drain, enricher, error catalog, `log.fork()`, wide event, pipeline. The full table, and the reason each alternative is wrong, is in `references/terminology.md`.
Bad: "Register the sink and every event reaches it."
Better: "Register the drain and every event reaches it."
Why: a term the reader learns here and cannot find in the API costs them the search twice.
Exception: a sentence describing another tool uses that tool's vocabulary. The scanner drops any hit in a sentence that names an alternative, and any term attached to a product that owns it, such as HyperDX's `otlphttp` exporter.

---

**U-16 · Every link resolves** · `critical`

Rule: an internal link points at a page that exists or at a path in `apps/docs/config/redirects.ts`. A relative link in a skill or an AGENTS.md points at a file on disk.
Why: a dead link is the one defect a reader cannot work around and cannot report usefully, and it is the one the scanner finds with certainty.
Note: this is a drift finding, raised mechanically. It is never a judgment call and never has a twin.
