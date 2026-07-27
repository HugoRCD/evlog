---
"@evlog/cli": minor
---

feat(cli): add `evlog init` — wires evlog into an existing app (install, framework integration, local `.evlog/logs` sink) for Nuxt, Nitro, Next.js, and TanStack Start. Config files are patched at the exact AST offsets so comments and formatting survive; existing files are never overwritten, and anything that cannot be done safely comes back as a manual step with the snippet to paste. `--dry-run` prints the plan, `--no-install` / `--no-sink` narrow it
