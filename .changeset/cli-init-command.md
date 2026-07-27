---
"@evlog/cli": minor
---

feat(cli): add `evlog init` — an interactive setup that reads the project, then wires evlog into an existing Nuxt, Nitro, Next.js, or TanStack Start app

It runs the same analysis `evlog map` runs and offers only what the project can back up: an error catalog when the same `createError` appears in more than one file, audit actions when sensitive entry points have no trail, the AI SDK and auth integrations when their packages are installed, batching when something actually leaves the process. Offers carry their evidence — "3 repeated errors found" — and the catalogs are seeded with the project's own errors and routes rather than scaffolded from a template

Development and production destinations are asked for separately, because nobody sends local traffic to Axiom and nobody reads production logs off the box's filesystem. Production takes several destinations at once and fans the event out to each; the generated plugin branches on the environment in one place. Only the filesystem drain is gated to development, and batching wraps the network sends but never the local write

Config files are patched at the exact AST offsets so comments and formatting survive; existing files are never overwritten, and a drain file that already wires the same destinations is left alone rather than duplicated. Secrets are never prompted for — the adapter's variables are appended to `.env.example`, never `.env`. The run finishes by executing `evlog doctor`, so it answers "did it work" instead of pointing at another command

Every prompt has a flag, so an agent reproduces exactly what a human just did: `--yes`, `--json`, a non-TTY, or `CI` selects the non-interactive path, and an unknown `--drain` or `--extras` value stops the run rather than silently defaulting. Run from a workspace root, it sets up the apps rather than the root package
