import type { ArgsDef, CommandDef, CommandContext } from 'citty'
import { defineCommand } from 'citty'
import { createContext } from '../core/context'
import { formatCommandHeader, wantsHeader } from '../core/brand'
import { writeHuman } from '../core/output'

type AnyCommand = CommandDef<ArgsDef>

function headerArgs(args: unknown): { json?: boolean, noHeader?: boolean } {
  const a = args as { json?: boolean, noHeader?: boolean }
  return { json: a?.json, noHeader: a?.noHeader }
}

/**
 * Define a citty command that prints the branded header
 * (`evlog <command> vX` + gradient) before running — unless disabled
 * (`--json`, `--no-header`, or `EVLOG_CLI_NO_HEADER=1`).
 *
 * Use for every leaf command so the CLI surface stays consistent as it grows.
 */
export function defineEvlogCommand<T extends ArgsDef = ArgsDef>(
  command: string,
  def: CommandDef<T>,
): CommandDef<T> {
  return defineCommand({
    ...def,
    meta: {
      ...def.meta,
      name: def.meta?.name ?? command.split(' ').at(-1),
    },
    async run(ctx: CommandContext<T>) {
      const cli = createContext()
      if (wantsHeader(cli, headerArgs(ctx.args))) {
        writeHuman(formatCommandHeader(cli, { command }))
      }
      return await def.run?.(ctx)
    },
  })
}

/**
 * Recursively wrap every leaf `run` handler in a command tree with the
 * branded header. Useful for third-party trees (e.g. `@evlog/telemetry`).
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
      const cli = createContext()
      if (wantsHeader(cli, headerArgs(ctx.args))) {
        writeHuman(formatCommandHeader(cli, { command: label }))
      }
      return await originalRun(ctx)
    },
  }
}
