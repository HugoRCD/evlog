# Blog rules

Apply to evlog blog posts. Load alongside `universal.md`. Nothing here is live yet. These rules exist so the first post is not written by improvisation.

A blog reader did not come for a task. They arrived from a link, they owe the post nothing, and they leave the moment a paragraph stops paying. Every rule below follows from that.

---

**B-01 · A post needs a reason that is not "we should blog"** · `critical`

Rule: a post exists because something happened or something is now true. A release with a real behavior change, a decision with a cost worth explaining, a problem solved in a way that transfers, a number that surprised us.
Bad: a general introduction to structured logging with evlog examples.
Better: why evlog emits one event per request instead of one per statement, what that costs in memory, and what it bought when we measured it.
Why: a post without a reason reads as content marketing however well it is written, and the audience for a logging library detects that instantly.

---

**B-02 · The first paragraph earns the second** · `critical`

Rule: open on a concrete situation, a number, or a decision. Never on a definition, never on a universal ("Every application produces logs"), never on the post's own agenda ("In this post we will explore").
Why: the title bought one paragraph. That paragraph has to buy the rest.

---

**B-03 · Name what it costs or what we got wrong** · `standard`

Rule: every post admits something: the constraint the design imposes, the case it does not handle, the thing we tried that failed. One honest admission, placed where it is relevant, not a disclaimer at the end.
Why: it is the fastest way to be believed, and a post with only wins reads as a release note in a costume.

---

**B-04 · Show the code that made the point** · `standard`

Rule: a technical claim in a post carries the code, the config, or the measurement that produced it, and the code is real, pasted from the repo or the bench rather than composed for the post.
Why: composed examples are always cleaner than reality, and readers who have written a logger can tell.

---

**B-05 · The post is not a docs page** · `standard`

Rule: a post argues, sequences, or narrates. It does not enumerate the API. Where the reader needs the reference, link the docs page and keep going.
Why: the two surfaces fail differently. A post that becomes a reference is skipped, and a reference that becomes a post is unusable.

---

**B-06 · Structure follows the argument, not a template** · `standard`

Rule: headings mark the turns in the reasoning. If every heading fits one grammatical mould, all noun phrases or all imperatives or all full declarative sentences, the structure came from a template rather than the argument. See `ai-tells.md`, T-06.
Why: template-shaped structure is the loudest whole-document tell, and it survives every sentence-level edit.

---

**B-07 · The ending lands the consequence** · `standard`

Rule: close on what changes for the reader: what to do, what to expect, what we will do next. Not a summary of what was just read, not a mirrored two-beat epigram.
Why: a recap tells the reader the post had nothing left, and a rhetorical close borrows finality it did not earn.

---

## The shapes a post can take

Pick one before drafting. The shape decides the opening move and the order.

**Release.** Something shipped. Opens on what the reader could not do yesterday. Shows the before and after in code. Names the constraint. Links the docs. Short.

**Decision.** We chose one design over another. Opens on the fork. Gives the alternative its strongest form before rejecting it. Names what the choice costs. Ends on the case where the other choice would still be right.

**Investigation.** Something was measured or debugged. Opens on the symptom with its number. Follows the actual order of discovery, including the wrong turn. Ends on what the number is now and what it means for the reader.

**Pattern.** A way of working that transfers. Opens on the situation the reader recognizes. Generalizes only after the concrete case has landed. Ends on how to adopt it, with the smallest first step.
