import { defineCommand } from 'citty'
import { withTelemetry } from '@evlog/telemetry'
import { subCommands } from './commands'
import { COMMON_ARGS } from './lib/command'
import { TOOL_NAME, VERSION } from './lib/constants'

/**
 * The evlog CLI command tree, telemetry-wrapped and ready for `runMain()`.
 * Command bodies live under `commands/` — see `commands/index.ts` to register one.
 */
export const main = withTelemetry(
  defineCommand({
    meta: {
      name: 'evlog',
      description: 'evlog — digging through logs is not observability. it\'s hope · https://evlog.dev',
      version: VERSION,
    },
    args: {
      debug: COMMON_ARGS.debug,
    },
    subCommands,
  }),
  { name: TOOL_NAME, version: VERSION },
)

export { TOOL_NAME, VERSION as version }
