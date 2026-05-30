# @evlog/cli

Observability for command-line tools — one **wide event per command**, drain pipeline, redact, **error and audit catalogs**.

**evlog does not replace your CLI.** You keep citty for routing, Clack/consola for the terminal, and your own `--json` stdout contract. `setupEvlog()` configures observability underneath — drain, wide events, redact, catalogs.

```text
Your CLI (unchanged)          evlog (configured once)
────────────────────          ────────────────────────
citty — argv, subcommands     wide event per command
Clack — spinners, colors      drain (.evlog/logs/…)
console.log / your --json     redact + audit on flags
```

Full docs: https://evlog.dev/integrate/frameworks/cli

## Install

```bash
pnpm add @evlog/cli evlog citty
pnpm add @clack/prompts   # optional — UI only, not required by evlog
```

## Project layout

Same shape as the [demo CLI](https://github.com/HugoRCD/evlog/tree/main/examples/cli):

```text
my-cli/
└── src/
    ├── index.ts          # entry — runMain + flush + exitWithError
    ├── drain.ts          # createCliDrain() — fs default, Axiom/etc. via env
    ├── evlog.ts          # setupEvlog({ drain: createCliDrain() })
    ├── catalogs/
    │   ├── errors.ts     # defineErrorCatalog → export errorCatalog
    │   └── audit.ts      # defineAuditCatalog → export auditCatalog
    └── commands/
        ├── index.ts      # main + subCommands map
        └── doctor.ts     # your command — Clack + useLogger()
```

---

## Walkthrough

### Step 1 — Drain + setup (`src/drain.ts` + `src/evlog.ts`)

Wide events only leave your process when you wire a **drain**. Default: local NDJSON. For Axiom/Datadog/OTLP, resolve the adapter at runtime from env — never embed tokens in a published CLI.

```typescript
// src/drain.ts
import type { DrainContext } from 'evlog'
import { createAxiomDrain } from 'evlog/axiom'
import { createFsDrain } from 'evlog/fs'
import { createDrainPipeline } from 'evlog/pipeline'

const pipeline = createDrainPipeline<DrainContext>({ batch: { size: 20 } })

export function createCliDrain() {
  if (process.env.EVLOG_DRAIN === 'axiom') {
    return pipeline(createAxiomDrain()) // reads AXIOM_API_KEY, AXIOM_DATASET from env
  }
  return pipeline(createFsDrain({ dir: process.env.EVLOG_LOG_DIR ?? '.evlog/logs' }))
}
```

```typescript
// src/evlog.ts
import { setupEvlog } from '@evlog/cli'
import { createCliDrain } from './drain'

export const setup = setupEvlog({
  service: 'my-cli',
  version: '1.0.0',
  redact: true,
  drain: createCliDrain(),
})
```

What this sets up:

- **Drain** — local `.evlog/logs/YYYY-MM-DD.jsonl` by default; set `EVLOG_DRAIN=axiom` (+ Axiom env) to send to a cloud dataset
- **Silent console** — evlog does not print to the terminal by default
- **Flush on exit** — pending batches are written before the process exits
- **Catalogs** (optional) — `errorCatalog` and `auditCatalog` from `defineErrorCatalog` / `defineAuditCatalog`

→ Full provider table and operator env vars: [Send events to Axiom (or another provider)](https://evlog.dev/integrate/frameworks/cli#send-events-to-axiom-or-another-provider)

### Step 2 — Wire citty entry (`src/index.ts`)

Pass `setup` to `runMain` — evlog wraps each command, your citty tree stays the same.

```typescript
import { exitWithError } from '@evlog/cli'
import { runMain } from '@evlog/cli/citty'
import { setup } from './evlog'
import { main } from './commands'

runMain(main, setup)          // was: runMain(main)
  .then(() => setup.flush())  // flush batched drain writes
  .catch(error => exitWithError(error))
```

`runMain(main, setup)` wraps every subcommand `run()` in `setup.invoke()` — one wide event per invocation (`method: CLI`, `path: /doctor`, duration, status). Global `--log` is injected automatically.

### Step 3 — Define commands (`src/commands/doctor.ts`)

**UI stays yours.** Telemetry goes through `useLogger()` — the command-scoped logger (same idea as HTTP middleware).

```typescript
import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import { useLogger } from '@evlog/cli'

export const doctor = defineCommand({
  meta: { name: 'doctor', description: 'Run health checks' },
  args: {
    json: { type: 'boolean', description: 'Machine-readable stdout (your format)' },
  },
  async run({ args }) {
    const log = useLogger()

    if (!args.json) p.intro('my-cli doctor')

    const s = args.json ? null : p.spinner()
    s?.start('Running checks')

    const checks = [
      { name: 'config', ok: true },
      { name: 'api', ok: true },
    ]

    log.set({ checks })

    s?.stop('Done')

    if (args.json) {
      console.log(JSON.stringify({ checks }))
    } else {
      p.outro(`All ${checks.length} checks passed`)
    }
  },
})
```

### Step 4 — Run it

```bash
bun src/index.ts doctor
# terminal → Clack UI
# .evlog/logs/2026-05-30.jsonl → wide event

bun src/index.ts doctor --log    # + pretty wide event on stderr
bun src/index.ts doctor --json   # your JSON on stdout; drain unchanged
```

### Step 5 — Add to an existing citty CLI

```diff
+ // src/drain.ts — fs by default; EVLOG_DRAIN=axiom for cloud
+ export function createCliDrain() { … }

  // src/evlog.ts
+ import { createCliDrain } from './drain'
+ export const setup = setupEvlog({ service: 'my-cli', version: '1.0.0', drain: createCliDrain() })

  // src/index.ts
+ import { runMain } from '@evlog/cli/citty'
+ import { setup } from './evlog'
- runMain(main)
+ runMain(main, setup).then(() => setup.flush()).catch(exitWithError)

  // src/commands/doctor.ts
+ import { useLogger } from '@evlog/cli'
  async run() {
+   useLogger().set({ checks: results })
    p.intro('…')    // unchanged
  }
```

---

## `setupEvlog()` vs `useLogger()`

| | `setupEvlog()` | `useLogger()` |
|---|----------------|---------------|
| When | once in `src/evlog.ts` | inside every command handler |
| Role | configure drain, redact, catalogs | command-scoped logger |
| You call | `runMain(main, setup)`, `setup.flush()` | `log.set()`, `log.audit()` |

---

## What evlog does / does not do

| | evlog | Your app |
|---|-------|----------|
| `--help`, subcommands | | citty |
| Spinners, colors, intros | | Clack, consola, … |
| `--json` stdout format | | your flag, your JSON shape |
| Wide events + drain | yes | |
| `--log` debug on stderr | yes | |
| Error catalog | yes | |
| Audit catalog | yes | |

---

## Optional — error catalog, audit catalog, HTTP

Catalogs are optional — see walkthrough step 3 and `pull` / `deploy` in the demo CLI.

---

## Exports

| Import | Description |
|--------|-------------|
| `@evlog/cli` | `setupEvlog`, `useLogger`, `createCommandLogger`, `parseCliError`, `exitWithError` |
| `@evlog/cli/citty` | `runMain`, `wrapCommandTree` (peer: `citty`) |
| `@evlog/cli/http` | `createOutboundHooks` (peer: `ofetch`) |

---

## Demo

```bash
# Local drain (default)
pnpm example:cli doctor
tail -f examples/cli/.evlog/logs/$(date +%Y-%m-%d).jsonl

# Debug wide events on stderr
pnpm example:cli doctor --log

# Axiom — env on the host (see src/drain.ts)
export EVLOG_DRAIN=axiom AXIOM_API_KEY=… AXIOM_DATASET=evlog-demo-cli
pnpm example:cli doctor
```

Full drain walkthrough: [CLI integration docs](https://evlog.dev/integrate/frameworks/cli#send-events-to-axiom-or-another-provider).
