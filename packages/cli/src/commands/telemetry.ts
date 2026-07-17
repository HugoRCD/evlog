import { defineTelemetryCommands } from '@evlog/telemetry'
import type { CommandDef } from 'citty'
import { TOOL_NAME } from '../lib/constants'
import { withCommandHeaders } from '../lib/command'

/**
 * `evlog telemetry *` — `@evlog/telemetry` consent commands, wrapped with
 * the branded command header on every leaf.
 */
export default withCommandHeaders(
  defineTelemetryCommands({ name: TOOL_NAME }) as CommandDef,
  ['telemetry'],
)
