import { defineEvlogHook } from 'evlog/eve'
import extension from '../extension'
import { toHookOptions, type ExtensionConfig } from '../lib/options'

/**
 * One evlog wide event per agent turn, wired from the mount config.
 *
 * The agent name is not available to a hook file at module scope, so the
 * service falls back to the mount's `service` and is otherwise resolved from
 * the turn context by evlog itself.
 */
export default defineEvlogHook(
  toHookOptions(extension.config as ExtensionConfig, extension.config.service ?? 'eve-agent'),
)
