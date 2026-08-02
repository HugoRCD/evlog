---
"@evlog/cli": minor
---

feat: add `evlog agents` — teach the AI agents working in a project how to use evlog. It writes a short, marker-delimited block of evlog conventions into `AGENTS.md` (one wide event per operation, grouped context via `log.set()`, `createError({ why, fix, internal })` over bare throws, `defineErrorCatalog()` once an error repeats, `log.audit()` on sensitive actions, and what never gets logged) and creates a `CLAUDE.md` pointing at it with `@AGENTS.md`. The block names the request-logger accessor for the detected framework (`useLogger(event)` on Nuxt and Nitro, `useLogger()` from `lib/evlog.ts` on Next.js, `req.context.log` on TanStack Start) and falls back to a generic one when detection finds nothing, so the command is useful outside the four frameworks `evlog map` covers.

The agent skills are installed by shelling out to `npx skills add https://www.evlog.dev`, the same way `evlog init` runs your package manager rather than unpacking a tarball itself. Each agent reads a different directory (`.claude/skills`, `.agents/skills`, `.codex/skills`, …) and the skills CLI already resolves them, symlinks a canonical copy, and supports a global scope — and since it keeps no manifest, a copy written behind its back would be a second one it could never update. Skills already installed, in any agent directory and either scope, are detected and left for `npx skills update`. `--skills <a,b>` narrows the selection, `--global` installs for every project, `--no-skills` writes the block with nothing spawned, `--source` points at another host, and `--dry-run` prints the plan. Interactive runs hand the terminal to the skills CLI so it can ask which agents to install for; non-interactive runs pass `--yes` so nothing blocks on a prompt nobody will answer.

`evlog init` now offers the same step as its last question — the `AGENTS.md` and `CLAUDE.md` writes are planned alongside the wiring so there is still one plan and one confirmation, and the skills run next to the package-manager install. `--no-agents` skips it. The block never needs the network, so a skills failure is reported without costing the rest of the run.

Both flows report the skills step whether or not it did anything — in the plan, in the written report, and through clack in an interactive run — so "already installed" is never confusable with "forgot to do it".

`CliContext` gains a `home` field, so the search for installed skills reads the home directory through the context like every other `process.*` value rather than calling `os.homedir()` directly.
