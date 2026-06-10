---
'evlog': minor
---

Improve dev terminal error output and introduce a clearer `dev` config API.

**Presets:** `dev: 'evlog' | 'nitro' | 'both'` — controls Nitro's Youch overlay (`frameworkOverlay`) and how much stack detail evlog prints in the wide event (`prettyError.detail`). Default in pretty dev is `'evlog'` (no Nitro overlay, full evlog error block). `'nitro'` keeps Nitro's stack and prints only message + Why/Fix/link in the wide event. `'both'` shows both full outputs.

**Explicit object:** `dev: { frameworkOverlay, prettyError: { snippet, stackDepth, compact, detail: 'full' | 'guidance' } }`.

Other improvements: tighter error blocks by default (`prettyError.compact`), tree spacers, hanging-indent Why/Fix wrapping, `stdout` for error wide events in dev, source-mapped file:line via Nitro `loadStackTrace`, Nitro error hook enrich+drain no longer blocks HTTP responses.
