import { EvlogError } from 'evlog'
import { EXIT_FAIL } from '../core/output'
import { defineEvlogCommand } from '../lib/command'
import { cliErrors } from '../lib/errors'
import { formatInitReport } from '../lib/init/report'
import { canPrompt } from '../lib/init/prompts'
import { parseDrainArg, parseExtrasArg } from '../lib/init/resolve'
import { runInit } from '../lib/init/run'
import type { InitResult } from '../lib/init/run'
import type { Framework } from '../lib/map/types'

const FRAMEWORKS: readonly Framework[] = ['nuxt', 'nitro', 'next', 'tanstack-start']

function parseFrameworkArg(value: unknown): Framework | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  if (!(FRAMEWORKS as readonly string[]).includes(value)) {
    throw cliErrors.MAP_INVALID_FRAMEWORK({ value })
  }
  return value as Framework
}

function parseServiceArg(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) return undefined
  return value.trim()
}

/**
 * `evlog init` — wire evlog into the project it is run in.
 *
 * Interactive by default and fully driveable by flags, because both callers are
 * real: a person picking a destination from a list, and an agent that must
 * never be left waiting on a keystroke. `--json`, `--yes`, a non-TTY stdin, or
 * `CI` all select the second path.
 *
 * The other commands score and diagnose; this one writes application code, so
 * it is deliberately conservative: it appends to configs, never rewrites them,
 * skips any file that already exists, and shows the plan before applying it.
 */
export default defineEvlogCommand('init', {
  meta: { name: 'init', description: 'Wire evlog into this project — install, config, drain' },
  /* The clack session draws its own intro; two banners read as two programs. */
  skipHeader: (ctx, args) => args.json !== true && args.yes !== true && canPrompt(ctx),
  args: {
    cwd: { type: 'string', description: 'Project directory (default: current)' },
    framework: { type: 'string', description: 'Override framework detection (nuxt, nitro, next, tanstack-start)' },
    service: { type: 'string', description: 'Service name on every wide event (default: package name)' },
    drain: { type: 'string', description: 'Where events go: fs, axiom, otlp, posthog, sentry, better-stack, datadog, hyperdx, none' },
    extras: { type: 'string', description: 'Comma-separated: enrichers, pipeline, sampling, vite' },
    yes: { type: 'boolean', alias: 'y', description: 'Skip every question and take the defaults' },
    dryRun: { type: 'boolean', description: 'Show what would change without writing anything' },
    // citty negations: declared positive so `--no-install` works.
    install: { type: 'boolean', default: true, description: 'Install evlog when missing (--no-install to skip)' },
  },
  async run({ args, cli, log, ui }) {
    const cwd = typeof args.cwd === 'string' && args.cwd.length > 0 ? args.cwd : undefined
    const ctx = cwd ? { ...cli, cwd } : cli

    let result: InitResult
    try {
      result = await runInit(ctx, log, {
        framework: parseFrameworkArg(args.framework),
        service: parseServiceArg(args.service),
        drain: parseDrainArg(args.drain),
        extras: parseExtrasArg(args.extras),
        dryRun: args.dryRun,
        install: args.install,
        yes: args.yes,
        /* JSON output and a prompt cannot share a terminal: the payload is the
           contract, and half a TUI on stderr in front of it helps nobody. */
        nonInteractive: args.json === true,
      })
    } catch (error) {
      if (error instanceof EvlogError) {
        log.finding({ code: error.code ?? 'cli.COMMAND_FAILED', why: error.why, fix: error.fix, link: error.link }, { status: 'fail' })
        ui.done({
          jsonMode: args.json,
          json: { error: { code: error.code, message: error.message, why: error.why, fix: error.fix } },
          human: error.fix ? `${error.message}\n→ ${error.fix}` : error.message,
        })
        ui.exit(EXIT_FAIL)
        return
      }
      throw error
    }

    ui.done({
      jsonMode: args.json,
      json: {
        framework: result.answers.framework,
        service: result.answers.service,
        drain: result.answers.drain,
        extras: result.answers.extras,
        packageManager: result.packageManager,
        install: result.install,
        written: result.written.map(action => ({ file: action.relative, kind: action.kind })),
        already: result.already,
        manual: result.manual.map(step => ({ title: step.title, file: step.file, reason: step.reason })),
        dropped: result.dropped,
        dryRun: result.dryRun,
        cancelled: result.cancelled,
      },
      /* The interactive flow already narrated itself; printing the report after
         it would repeat the whole run under the outro. */
      human: result.interactive ? undefined : formatInitReport(ctx, result),
    })

    if (result.install.status === 'failed') {
      ui.exit(EXIT_FAIL)
    }
  },
})
