import type { ArgsDef, CommandDef, CommandContext, CommandMeta } from 'citty'
import { defineCommand } from 'citty'
import { createContext } from '../core/context'
import type { CliContext } from '../core/context'
import { formatCommandHeader, wantsHeader } from '../core/brand'
import { writeHuman } from '../core/output'
import { withCliDebug } from './debug'
import type { CliDebug, DebugArgs } from './debug'
import { createUi } from './ui'
import type { CliUi } from './ui'

type AnyCommand = CommandDef<ArgsDef>

/**
 * Args injected on every {@link defineEvlogCommand} leaf.
 * Commands may still declare their own; these are merged in (command wins on clash).
 */
export const COMMON_ARGS = {
  json: { type: 'boolean', description: 'Machine-readable JSON on stdout' },
  debug: { type: 'boolean', description: 'Emit a debug case file via evlog' },
  noHeader: { type: 'boolean', description: 'Skip the branded command header' },
} as const satisfies ArgsDef

/** Citty context plus CLI helpers injected by {@link defineEvlogCommand}. */
export type EvlogRunContext<T extends ArgsDef = ArgsDef> = CommandContext<T> & {
  /** Process / terminal context (cwd, env, color, …). */
  cli: CliContext
  /**
   * Debug handle — always present. No-ops when `--debug` is off;
   * `log.step` still executes the work.
   */
  log: CliDebug
  /**
   * Terminal output — `human` (stderr), `json` (stdout), `exit`, `done`.
   * Prefer this over touching `process.stdout` / `exitCode` in commands.
   */
  ui: CliUi
}

export type EvlogCommandDef<T extends ArgsDef = ArgsDef> = Omit<CommandDef<T>, 'run' | 'args'> & {
  args?: T
  run?: (ctx: EvlogRunContext<T & typeof COMMON_ARGS>) => ReturnType<NonNullable<CommandDef<T>['run']>>
}

function runArgs(args: unknown): DebugArgs & { noHeader?: boolean } {
  const a = args as DebugArgs & { noHeader?: boolean }
  return { json: a?.json, noHeader: a?.noHeader, debug: a?.debug }
}

function syncMeta(meta: CommandDef['meta']): CommandMeta {
  if (meta && typeof meta === 'object' && !('then' in meta)) {
    return meta
  }
  return {}
}

/**
 * Define a citty command with branded header, shared flags, debug filet, and `ui`.
 *
 * `run` receives `{ …citty, cli, log, ui }`.
 *
 * @example
 * ```ts
 * export default defineEvlogCommand('audit', {
 *   meta: { description: '…' },
 *   args: { since: { type: 'string' } },
 *   async run({ args, cli, log, ui }) {
 *     const data = await log.step('load', () => load(cli.cwd))
 *     ui.done({
 *       jsonMode: args.json,
 *       json: { data },
 *       human: format(data),
 *       summary: { ok: 1, warn: 0, fail: 0 },
 *     })
 *   },
 * })
 * ```
 */
export function defineEvlogCommand<T extends ArgsDef = ArgsDef>(
  command: string,
  def: EvlogCommandDef<T>,
): CommandDef<T & typeof COMMON_ARGS> {
  const baseMeta = syncMeta(def.meta)
  const args = {
    ...COMMON_ARGS,
    ...def.args,
  } as T & typeof COMMON_ARGS

  return defineCommand({
    ...def,
    args,
    meta: {
      ...baseMeta,
      name: baseMeta.name ?? command.split(' ').at(-1),
    },
    async run(ctx: CommandContext<T & typeof COMMON_ARGS>) {
      const flags = runArgs(ctx.args)
      const cli = createContext()
      if (wantsHeader(cli, flags)) {
        writeHuman(formatCommandHeader(cli, { command }))
      }
      const ui = createUi({ json: flags.json })
      return await withCliDebug(cli, { command, ...flags }, async (log) => {
        return await def.run?.({ ...ctx, cli, log, ui })
      })
    },
  } as CommandDef<T & typeof COMMON_ARGS>)
}

/**
 * Recursively wrap every leaf `run` handler in a command tree with the
 * branded header (and optional debug wide event). Useful for third-party
 * trees (e.g. `@evlog/telemetry`).
 *
 * @param path - Command path segments already walked, e.g. `['telemetry']`.
 */
export function withCommandHeaders(cmd: AnyCommand, path: string[] = []): AnyCommand {
  const wrappedSubs = cmd.subCommands
    ? Object.fromEntries(
      Object.entries(cmd.subCommands).map(([key, sub]) => [
        key,
        withCommandHeaders(sub as AnyCommand, [...path, key]),
      ]),
    )
    : undefined

  if (!cmd.run) {
    return { ...cmd, subCommands: wrappedSubs }
  }

  const label = path.join(' ') || 'evlog'
  const originalRun = cmd.run

  return {
    ...cmd,
    subCommands: wrappedSubs,
    async run(ctx) {
      const flags = runArgs(ctx.args)
      const cli = createContext()
      if (wantsHeader(cli, flags)) {
        writeHuman(formatCommandHeader(cli, { command: label }))
      }
      return await withCliDebug(cli, { command: label, ...flags }, () => originalRun(ctx))
    },
  }
}
