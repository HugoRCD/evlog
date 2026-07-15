import type { CommandDef } from 'citty'
import { createTelemetry } from './create'
import type { CollectFields, CollectFlags, TelemetryOptions } from './types'

type AnyCommand = CommandDef & {
  subCommands?: Record<string, AnyCommand>
}

function wrapCommand(
  command: AnyCommand,
  telemetry: ReturnType<typeof createTelemetry>,
  path: string[],
  isRoot = false,
): AnyCommand {
  const segment = command.meta?.name
  const commandPath = isRoot && command.subCommands
    ? path
    : segment
      ? [...path, segment]
      : path

  const wrappedSub = command.subCommands
    ? Object.fromEntries(
      Object.entries(command.subCommands).map(([key, sub]) => [
        key,
        wrapCommand(sub, telemetry, commandPath, false),
      ]),
    )
    : undefined

  return {
    ...command,
    subCommands: wrappedSub,
    run: command.run
      ? (ctx) => {
        const name = commandPath.join(' ') || segment || 'run'
        return telemetry.run(name, () => command.run!(ctx), {
          flags: ctx.args as Record<string, unknown>,
        })
      }
      : command.run,
  }
}

/**
 * Wrap a citty command tree with telemetry — one wide event per command execution.
 * Returns the wrapped command for `runMain()`.
 */
export function withTelemetry<
  TFlags extends CollectFlags = {},
  TFields extends CollectFields = {},
>(
  command: CommandDef,
  options: TelemetryOptions<TFlags, TFields>,
): CommandDef {
  const instance = createTelemetry(options)
  return wrapCommand(command as AnyCommand, instance, [], true)
}
