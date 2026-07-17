<p align="center">
  <img src="https://raw.githubusercontent.com/HugoRCD/evlog/main/assets/evlog-banner.gif" width="100%" alt="evlog — Digging through logs is not observability. It's hope" />
</p>

# @evlog/cli

[![npm version](https://img.shields.io/npm/v/@evlog/cli?color=black)](https://npmjs.com/package/@evlog/cli)
[![npm downloads](https://img.shields.io/npm/dm/@evlog/cli?color=black)](https://npm.chart.dev/@evlog/cli)
[![CI](https://img.shields.io/github/actions/workflow/status/HugoRCD/evlog/ci.yml?branch=main&color=black)](https://github.com/HugoRCD/evlog/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-black?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Documentation](https://img.shields.io/badge/Documentation-black?logo=readme&logoColor=white)](https://evlog.dev)
[![license](https://img.shields.io/github/license/HugoRCD/evlog?color=black)](https://github.com/HugoRCD/evlog/blob/main/LICENSE)

**Digging through logs is not observability. It's hope.**

The official command line for [evlog](https://evlog.dev).

Diagnose your install. Inspect wide events. Audit and map what your app emits.

## Usage

```bash
npx @evlog/cli doctor              # diagnose the current project
npx @evlog/cli doctor --json       # machine-readable output on stdout
npx @evlog/cli doctor --no-header  # skip the branded title + gradient
```

Or install it as a devDependency:

```bash
pnpm add -D @evlog/cli
pnpm evlog doctor
```

## Header

Every command prints a short branded header (`evlog <command>` + gradient). Disable it when you want quieter output:

| Mechanism | Example |
| --- | --- |
| Flag (any command) | `evlog doctor --no-header` |
| Env (persistent) | `EVLOG_CLI_NO_HEADER=1` or `EVLOG_CLI_HEADER=0` |
| JSON mode | `evlog doctor --json` (header never printed) |

## Commands

| Command | What it does |
| --- | --- |
| `evlog doctor` | Monorepo-aware diagnosis: Node, project/workspace, stack, evlog install, `.evlog/logs` |
| `evlog doctor --cwd <dir>` | Run against another directory |
| `evlog telemetry status` | Show telemetry status and disclosure |
| `evlog telemetry enable` / `disable` | Change telemetry preference (disable purges buffered data) |

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | All checks passed (warnings allowed) |
| `1` | At least one check failed |
| `2` | Usage error (unknown command or flags) |

## `--json` output

With `--json`, the payload is the **only** thing written to stdout — everything human goes to stderr. The shape is a contract:

```jsonc
{
  "schemaVersion": 1,
  "checks": [{ "id": "node", "status": "ok", "message": "Node v22.1.0" }],
  "summary": { "ok": 4, "warn": 0, "fail": 0 }
}
```

Breaking this shape requires a `schemaVersion` bump.

## Adding a command

1. Create `src/commands/<name>.ts` exporting a **default** citty command via `defineEvlogCommand('name', …)` from `lib/command` — that prints the branded header (`evlog <name>` + gradient) automatically. Pure logic in the same file (or under `lib/`); render via `core/output.ts`. Skip the header yourself only for `--json`.
2. Register it with one import + one line in [`src/commands/index.ts`](src/commands/index.ts).

`src/index.ts` stays a thin shell (meta + `withTelemetry`). Do not embed command bodies there.

```
src/
  cli.ts              # bin entry (runMain)
  index.ts            # main command tree
  commands/           # one file per command + registry
  core/               # context, output, brand, usage
  lib/                # shared constants / helpers
```


## Telemetry

The CLI records **one anonymous wide event per command** via [`@evlog/telemetry`](https://npmjs.com/package/@evlog/telemetry) (tool name `evlog-cli`): command name, duration, outcome, sanitized flags. No arguments, paths, or file contents. Opt out anytime:

```bash
evlog telemetry disable   # or DO_NOT_TRACK=1 / EVLOG_TELEMETRY=0
```

Full policy: [evlog.dev — telemetry](https://evlog.dev/use-cases/telemetry/overview)

## Docs

Full guide: [evlog.dev](https://evlog.dev)
