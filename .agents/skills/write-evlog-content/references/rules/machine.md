# Rules for the surfaces an agent reads

Applies to `.agents/skills/`, `apps/docs/skills/`, and every `AGENTS.md`. Read `universal.md` first: the house rules hold here too, punctuation included.

What changes is who is reading. A docs page is read by someone who can tell that a sentence is vague and go look elsewhere. A skill is read by a model that will act on it, at the altitude the file sets, without the option of doubting it. So the failure modes invert: rhythm stops mattering, and precision, ordering, and scope start deciding outcomes.

The scanner reflects this. On these surfaces it runs the house rules and the drift checks only, and leaves epigram density, heading shape, bullet frames, and sentence uniformity alone. A procedure whose four steps are four parallel imperatives is a procedure.

---

**M-01 · An instruction is imperative and has a subject that acts** · `standard`

Rule: write "run the scanner before judging a candidate", not "the scanner should be run first" and not "it is recommended to run the scanner".
Why: a passive instruction leaves the actor unbound, and a model reading it will decide the actor is someone else.

---

**M-02 · Say what to do, then what it costs, and never a third thing** · `standard`

Rule: one instruction per bullet or paragraph. Where an instruction has a price (a slower run, a rebuild, a token budget), it goes in the same place. Background belongs in a separate section the reader can skip.
Why: a model follows the instruction it can find. An instruction buried in explanation is a coin flip.

---

**M-03 · Every path, command, and symbol is verified at write time** · `critical`

Rule: a path in a skill exists, a command in a skill runs, a symbol in a skill is exported. Check before writing, not after review.
Why: a wrong path in a docs page makes a reader search. A wrong path in a skill makes an agent invent a plausible one, and the invention propagates into a PR.

---

**M-04 · The file states its own bounds** · `critical`

Rule: a skill or an AGENTS.md says what it does not cover and what must never be done under it. Bounds are as load-bearing as procedure, and they are the first thing a summary drops.
Why: capability without bounds is the shape of every unattended change nobody wanted.

---

**M-05 · No motivation, no reassurance, no summary** · `standard`

Rule: cut "this is important because", "as you can see", and the closing paragraph restating the file. A skill opens on what it is for in one sentence and then does the work.
Why: these files are loaded into a context window with a budget. Every reassuring sentence displaces an instruction.

---

**M-06 · Frontmatter `description` is a routing decision** · `critical`

Rule: a SKILL.md description names the situations that should load it, in the words someone would use when they are in one. It is read to decide whether to load the file, not to summarize it.
Why: a description that describes the file's contents instead of its triggers produces a skill that exists and never loads.

---

**M-07 · The file matches the code today** · `critical`

Rule: when a skill documents a workflow, an API, or a directory layout, it is true of `main` as it stands. When the code moves, the skill moves in the same change.
Why: a skill describing the old behavior is worse than no skill, because it is trusted. `AGENTS.md` says this about itself; this is the rule it is saying.

---

**M-08 · Examples are copied from the repository, not composed** · `standard`

Rule: a code sample in a skill comes from a file that exists, and names that file. A composed example drifts silently because nothing compiles it.
Why: the examples are what an agent pattern-matches on, so a composed one becomes real code in the next PR.

---

**M-09 · Rewriting these files is a proposal** · `critical`

Rule: a content pass may report findings on a skill or an AGENTS.md and may fix a house-rule violation (punctuation, a dead link, a stale path it verified). Anything touching procedure, bounds, or a `description` goes to the maintainer as a finding, not a diff.
Why: these files govern the agent doing the rewriting. That loop needs a person in it.
