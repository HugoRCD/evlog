# evlog docs (Docus site)

Read the root `AGENTS.md` first — this file only adds docs-specific rules.

## Nuxt UI components in MDC

Nuxt UI ships the components this site renders inside markdown. Use them as the module exposes them, and never rename or re-skin one from the outside.

- **Call the component by its MDC tag, not by its Vue name.** `@nuxt/ui` registers a tag map (`mdc.components.map` in its module): `::accordion`, `::accordion-item`, `::callout`, `::card-group`, `::code-group`, `::collapsible`, `::field`, `::steps`, `::tabs`. Writing `::prose-accordion` reaches the same globally-registered component by accident and is wrong: the tag map is the public surface, the `Prose*` names are Nuxt UI internals.
- **Only pass props the prose wrapper declares.** The wrappers are thin and expose a small set (`ProseAccordion` takes `type`, `class`, `ui`). Anything else lands on the underlying component through attribute fall-through, which happens to work until the wrapper grows a root element. Read the component in `node_modules/@nuxt/ui/dist/runtime/components/prose/` before inventing an attribute.
- **Style a component through its own `ui` prop or `app.config.ts`**, never by wrapping it in a bordered box. An accordion already draws its dividers; a parent that adds a border and a background is fighting the theme and will drift from it.
- **A component carries meaning, not texture.** An accordion holds answers the reader chooses between. Do not fold prose that already reads fine into a component, and never restate on a page something the same page says a few paragraphs above.

## Structured data

JSON-LD on a page is generated from the content that page renders, never hand-maintained beside it. `app/pages/index.vue` builds its `FAQPage` entities from the landing markdown with `collectFaqEntries`, so the machine-readable answers cannot drift from the visible ones. A second copy of the same prose in a `.vue` file is the defect, not the feature.

## Doc animation components (`app/components/content/`)

MDC animation components (e.g. `EnricherChain`, `DrainFanOut`, `StreamBus`) follow a strict set of rules:

- **Fixed outer size, always.** The component must occupy the same height and width from t=0 to the end of the loop. Layout below the animation must not shift while the user reads the page.
- **Pre-allocate every slot.** Lines, rows, frames, buffer cells must all exist in the DOM from the start. Animate `opacity`, `color`, `transform` — never `max-height: 0 → N`, never conditional `v-if` on structural elements.
- **Use `useTimedSequence`** from `~/composables/useTimedSequence` for the timeline. Honor `prefers-reduced-motion` by snapping to the final state.
- **Wrap in `<Motion>` from `motion-v`** with `not-prose my-8` and an `IntersectionObserver` so the animation starts when scrolled into view.
- **Header bar** with status pill + play/pause + restart buttons (mirror `DrainFanOut.vue`).
- **Compact by default**: `text-[10px]` for body, `text-[9px]` for footers/labels, `leading-tight` or `leading-snug`, `py-1.5` / `py-2` headers/footers, `space-y-0.5` or none, `gap-1.5` or smaller. The doc page width (sidebar + TOC) is narrow; aim for a final height under ~280px.
- Use `<div>` (not `<ol>/<li>`) for repeating slots — list elements collide with grid layout in Docus.
- **No viewport-dependent layout shift.** Stick to a single column at any width or use `sm:` for the optional split — never `lg:` (the doc content area never reaches the `lg:` breakpoint).
