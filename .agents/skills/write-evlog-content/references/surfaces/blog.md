# Surface: blog post

Not live yet. This file defines the genre before the first post, so it is not defined by whatever the first post happens to look like.

## Who reads it

Someone who writes TypeScript for a living and has already solved logging badly at least once. They found the post through a link, not a search. They have read a lot of posts by libraries about themselves and they discount all of them by default.

That discount is the design constraint. It is paid down with specifics: real numbers, real code, and one honest admission.

## Before drafting

Answer these four in a sentence each. If any of them is hard, the post is not ready.

1. **What happened?** The release, the measurement, the decision, the bug. A post needs an event.
2. **Who is it for, precisely?** "Developers" is not an audience. "Someone running a Nitro app who has never drained logs anywhere" is.
3. **What do they think now, and what do they think after?** One belief that changes.
4. **What does it cost us to say?** The constraint, the trade, the thing that does not work yet. See B-03.

Then pick a shape from `rules/blog.md`, release or decision or investigation or pattern, and let it set the opening move.

## Anatomy

```
title           the claim or the concrete thing, never a topic label
description     the reason to read, as a sentence. This is the social preview
opening         situation or number, 2-4 sentences, no definition
body            sections that mark the turns in the argument
code            real, pasted from the repo or the bench
admission       what it costs or what we got wrong, where it belongs
close           what changes for the reader, or what is next
```

## Length

As long as the argument, and no longer. A release post that says the thing in 400 words is a good release post. A post padded to look substantial reads as padded, and the padding is always the generic paragraphs, which is exactly what `ai-tells.md` catches.

## Recurring failure modes for a library blog

- **The post that is a docs page.** If the reader could get it from `/learn`, link `/learn`. See B-05.
- **The post that argues against a strawman.** Comparisons name the real tool and stay accurate about it. See U-12.
- **The post with no author in it.** A decision post with no one making the decision reads as generated, because that is exactly what generated text lacks.
- **The retrospective with no cost.** Every failure resolved cleanly within its own paragraph is a document-level tell, not a story.

## Review

Same review as any surface, with `rules/blog.md` loaded and `ai-tells.md` weighted harder. Blog prose has no reference register to hide behind: on a docs page uniform sentence length is the genre, in a post it is a finding.
