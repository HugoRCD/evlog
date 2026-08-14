# evlog docs (Docus site)

Read the root `AGENTS.md` first — this file only adds docs-specific rules.

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

## Capture hooks (`data-section`)

Every landing section and every MDC content component carries `data-section="<its MDC tag>"` on its root element: `LandingHero.vue` renders `data-section="landing-hero"`, `DrainFanOut.vue` renders `data-section="drain-fan-out"`.

- **A new section component adds its hook in the same commit.** The value is the kebab-case MDC tag the markdown already uses, so the two never have to be reconciled.
- **The hook exists because utility classes cannot identify a section.** Eleven landing sections render the identical `section.py-24.md:py-32`; a screenshot tool handed that selector frames the wrong one, or silently frames the top of the page.
- **It is a tooling hook, not an anchor.** Add an `id` when a section deserves a real URL fragment. Keep the two separate: an `id` gets renamed for reader-facing reasons, `data-section` follows the component.
