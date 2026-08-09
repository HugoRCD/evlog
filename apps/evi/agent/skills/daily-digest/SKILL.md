---
name: daily-digest
description: Build and deliver the daily activity digest, covering GitHub activity, AI Gateway spend, visitor counts, CLI usage, and a short news section. Load this when the morning digest schedule fires, or when someone asks for a digest, a daily recap, or "what happened" over a recent period, on any channel.
---

# Daily digest

One message summarizing the last 24 hours, most attention-worthy first. Post it to the thread the request came from. Read-only: gather and report, never modify anything.

When the request names a different window ("this week", "since Monday"), keep the structure and widen the window; the 24-hour default is for the scheduled morning run.

## Sections, in order

1. **GitHub (last 24h).** New and updated issues, merged and open pull requests, CI state on `main` (`getCiFailureContext` when red). Lead with whatever needs attention: a red build, a stalled community PR, an issue with activity. Skip empty categories with one word, never with an apology.
2. **AI Gateway spend (last 24h).** `ai_gateway__report` totals, with a one-line callout only when spend is unusual against recent days.
3. **Visitors (last 24h).** `vercel__get_web_analytics` (`mode: 'count'`, `dataset: 'visits'`) for the docs site and the other evlog projects.
4. **CLI usage (last 7d).** `telemetry-stats` and `telemetry-adoption`: runs, success rate, top command, and one interesting signal when there is one, such as a CLI version rolling out, a flag gaining traction, an error code creeping up, or a source-mix shift. One or two lines; one word when the numbers are flat.
5. **Worth reading.** 2 or 3 short items of AI or ecosystem news worth Hugo's time today, each with a link and a date.

## Form

- At most 10 lines for the GitHub section; the whole digest stays scannable in one screen.
- Plain sentences and short bullets. Links inline. No preamble, no sign-off.
- A section whose tools are unavailable is reported in one line naming the failing tool, and the rest of the digest still ships.
