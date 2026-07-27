---
"@evlog/cli": minor
---

feat(cli): add `evlog init` — an interactive setup that wires evlog into an existing Nuxt, Nitro, Next.js, or TanStack Start app. Asks for the service name, fuzzy-searches the destination across every adapter evlog ships (Axiom, OTLP, PostHog, Sentry, Better Stack, Datadog, HyperDX, local files), offers batching, enrichers, sampling and the Vite plugin as a multi-select, then shows the exact file list and waits for a yes before writing anything

Config files are patched at the exact AST offsets so comments and formatting survive; existing files are never overwritten, and anything that cannot be done safely comes back as a manual step with the snippet to paste. Secrets are never prompted for — the environment variables the chosen adapter reads are printed instead

Every prompt has a flag, so an agent reproduces exactly what a human just did: `--yes`, `--json`, a non-TTY, or `CI` selects the non-interactive path, and an unknown `--drain` or `--extras` value stops the run rather than silently defaulting
