import { EvlogError } from 'evlog'
import { EXIT_FAIL } from '../core/output'
import { defineEvlogCommand } from '../lib/command'
import { cliErrors } from '../lib/errors'
import { formatInitReport } from '../lib/init/report'
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
 * The other two commands score and diagnose; this one is the only one that
 * writes application code, so it is deliberately conservative: it appends to
 * configs, never rewrites them, and skips any file that already exists.
 */
export default defineEvlogCommand('init', {
  meta: { name: 'init', description: 'Wire evlog into this project — install, config, local sink' },
  args: {
    cwd: { type: 'string', description: 'Project directory (default: current)' },
    framework: { type: 'string', description: 'Override framework detection (nuxt, nitro, next, tanstack-start)' },
    service: { type: 'string', description: 'Service name on every wide event (default: package name)' },
    dryRun: { type: 'boolean', description: 'Show what would change without writing anything' },
    // citty negations: declared positive so `--no-install` / `--no-sink` work.
    install: { type: 'boolean', default: true, description: 'Install evlog when missing (--no-install to skip)' },
    sink: { type: 'boolean', default: true, description: 'Write a local .evlog/logs drain (--no-sink to skip)' },
  },
  async run({ args, cli, log, ui }) {
    const cwd = typeof args.cwd === 'string' && args.cwd.length > 0 ? args.cwd : undefined
    const ctx = cwd ? { ...cli, cwd } : cli

    let result: InitResult
    try {
      result = await runInit(ctx, log, {
        framework: parseFrameworkArg(args.framework),
        service: parseServiceArg(args.service),
        dryRun: args.dryRun,
        install: args.install,
        sink: args.sink,
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
        framework: result.framework,
        service: result.service,
        packageManager: result.packageManager,
        install: result.install,
        written: result.written.map(action => ({ file: action.relative, kind: action.kind })),
        already: result.already,
        manual: result.manual.map(step => ({ title: step.title, file: step.file, reason: step.reason })),
        dryRun: result.dryRun,
      },
      human: formatInitReport(ctx, result),
    })

    if (result.install.status === 'failed') {
      ui.exit(EXIT_FAIL)
    }
  },
})
