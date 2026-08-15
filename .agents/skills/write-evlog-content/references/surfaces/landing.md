# Surface: landing page

`apps/docs/content/0.landing.md`. MDC components with named slots (`#title`, `#description`, `#headline`), `:br` for controlled line breaks, and props in `---` blocks.

## What it is

A set of promises, each attached to a page that keeps it. That framing decides every edit: the question for a card is not "does this read well" but "which page proves this, and does that page actually prove it".

## Structure

```
landing-hero        the position, in a line that could not be a competitor's
landing-logos       social proof, no copy
landing-features    one card per capability: headline, title, description, link
...                 subsequent sections
```

Each `features-feature-*` card carries `link` and `link-label` in its prop block. That link is the promise's receipt. A card whose link goes to a page that does not demonstrate the claim is an L-01 finding and it is critical.

## Writing a card

- **headline**: the category, two words, no verb. "Simple API", "Drain Pipeline".
- **title**: the before and after, compressed, `:br` for the break. "Set context. :br Get answers". This is the one place fragments are the point.
- **description**: the mechanism. Two or three sentences naming what actually happens: the API call, the failure it prevents, the number. This is where a technical reader decides whether the title was real.

The pattern that works on the current page is title-as-consequence, description-as-mechanism. A card that reverses it, putting an abstract description under a concrete title, is a finding.

## What an automated pass may do here

Report. Only critical findings become an edit: a dead link, a promise no page keeps, a claim the source contradicts, a stale version or count. Voice and rhythm findings on the landing go to a human, because the brand decisions this page encodes are not written down anywhere a reviewer can read them. See L-06.

## The hardest judgment on this page

Marketing prose and generated prose fail identically: a sentence that sounds like value and names nothing. The tell list does not get relaxed here because it is a marketing surface. It gets applied harder, with one exception. The deliberate fragment rhythm in `#title` slots is a design decision, and it lands a capability each time. Check that it lands one. Two cards using the same device for the same kind of claim is a finding against the second.
