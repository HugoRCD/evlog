# evlog CLI example

Three levels in one demo — why evlog on a CLI:

| Level | Command | What you get |
|-------|---------|----------------|
| **Simple** | `doctor` | One wide event per run — duration, checks, exit status → drain |
| **Medium** | `sync` | Same + outbound HTTP fields on the wide event |
| **Advanced** | `pull`, `deploy` | Error catalog, audit catalog, deny, before/after changes |

No audit or catalog required for basic observability — `useLogger().set()` is enough.

## Run

```bash
pnpm example:cli doctor              # simple — wide event only
pnpm example:cli sync 3              # medium — http.outbound on the event
pnpm example:cli pull --token shlv_demo --env production   # audit + redact
pnpm example:cli pull --env staging                        # audit.deny (no token)
pnpm example:cli deploy --region us-east-1
pnpm example:cli doctor --log          # debug: pretty event on stderr
```

## Where events go

**evlog does not send anywhere by itself.** Wide events only leave the process through the **drain** you pass to `setupEvlog({ drain })`. This demo resolves the drain in `src/drain.ts` from `EVLOG_DRAIN`.

### Default — local files (no token)

```bash
pnpm example:cli doctor
# → examples/cli/.evlog/logs/YYYY-MM-DD.jsonl

tail -f examples/cli/.evlog/logs/$(date +%Y-%m-%d).jsonl
```

### Axiom — env on the machine that runs the binary

Never bake tokens into the package. Set env where the CLI runs (your shell, CI, cron, server):

```bash
export EVLOG_DRAIN=axiom
export AXIOM_API_KEY=xaat-…    # or AXIOM_TOKEN
export AXIOM_DATASET=evlog-demo-cli
pnpm example:cli doctor
```

Check the dataset in [Axiom](https://app.axiom.co). Same wide event shape as the local NDJSON file.

### Other providers

Add a `case` in `src/drain.ts` and set the adapter env vars documented on [evlog.dev/adapters](https://evlog.dev/integrate/adapters/overview):

| `EVLOG_DRAIN` | Import | Typical env |
|---------------|--------|-------------|
| `datadog` | `evlog/datadog` | `DATADOG_API_KEY`, `DATADOG_SITE` |
| `otlp` | `evlog/otlp` | `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME` |

Copy `.env.example` to `.env` for local experiments (gitignored).

## Layout

```text
src/
├── drain.ts          # createCliDrain() — fs default, cloud via EVLOG_DRAIN
├── evlog.ts          # setupEvlog({ drain: createCliDrain() })
├── catalogs/         # optional — pull & deploy only
└── commands/
```

Full walkthrough: [CLI integration docs](https://evlog.dev/integrate/frameworks/cli#send-events-to-axiom-or-another-provider).
