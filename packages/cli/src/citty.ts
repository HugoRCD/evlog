import type { CommandDef } from 'citty'
import { runMain as cittyRunMain } from 'citty'
import { evlogLogArg } from './presentation'
import type { EvlogSetup } from './types'

/** Options forwarded to citty's {@link runMain}. */
export interface RunMainOptions {
  rawArgs?: string[]
}

function argsToFlags(args: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!args) return {}
  return { ...args }
}

function resolveCommandName(path: string[]): string {
  return path.length > 0 ? path.join('/') : 'main'
}

function mergeEvlogArgs(command: CommandDef): CommandDef['args'] {
  return { ...evlogLogArg, ...command.args }
}

/**
 * Wrap a citty command tree so every `run()` executes inside
 * {@link EvlogSetup.invoke} (auto-emit wide event, drain, audit).
 *
 * Injects global `--log` on every command. Use {@link useLogger} inside handlers.
 *
 * @example
 * ```ts
 * import { defineCommand } from 'citty'
 * import { setupEvlog } from '@evlog/cli'
 * import { runMain } from '@evlog/cli/citty'
 *
 * const setup = setupEvlog({ service: 'my-cli', version: '1.0.0' })
 * runMain(mainCommand, setup)
 * ```
 */
export function wrapCommandTree(
  command: CommandDef,
  path: string[],
  setup: EvlogSetup,
  rawArgs: string[],
): CommandDef {
  const wrapped: CommandDef = {
    ...command,
    args: mergeEvlogArgs(command),
  }

  if (command.subCommands) {
    wrapped.subCommands = Object.fromEntries(
      Object.entries(command.subCommands).map(([name, sub]) => [
        name,
        wrapCommandTree(sub as CommandDef, [...path, name], setup, rawArgs),
      ]),
    )
  }

  if (command.run) {
    const originalRun = command.run
    wrapped.run = (context) => {
      const commandName = resolveCommandName(path)
      return setup.invoke(
        {
          command: commandName,
          argv: rawArgs,
          flags: argsToFlags(context.args as Record<string, unknown> | undefined),
        },
        () => originalRun(context),
      )
    }
  }

  return wrapped
}

/**
 * citty entry point with evlog lifecycle wired around each command `run()`.
 */
export function runMain(
  command: CommandDef,
  setup: EvlogSetup,
  options?: RunMainOptions,
): Promise<void> {
  const rawArgs = options?.rawArgs ?? process.argv.slice(2)
  const wrapped = wrapCommandTree(command, [], setup, rawArgs)
  return cittyRunMain(wrapped, options)
}
