import type { AuditableLogger } from 'evlog'
import {
  createLoggerStorage,
  defineFrameworkIntegration,
  type BaseEvlogOptions,
} from 'evlog/toolkit'
import { applyCliContext } from './enrichers'
import type { CliContext, CreateCommandLoggerOptions } from './types'

const { storage, useLogger: getLogger } = createLoggerStorage(
  'command context. Wrap handlers with setup.invoke() or runMain() from @evlog/cli/citty.',
)

/**
 * Request logger for the current command. Always auditable inside `invoke()`.
 */
function useLogger<T extends object = Record<string, unknown>>(): AuditableLogger<T> {
  const logger = getLogger<T>()
  return logger as AuditableLogger<T>
}

export { useLogger }

const integration = defineFrameworkIntegration<CliContext>({
  name: 'cli',
  extractRequest: (ctx) => ({
    method: 'CLI',
    path: `/${ctx.command}`,
    requestId: crypto.randomUUID(),
  }),
  attachLogger: () => {},
  storage,
})

/**
 * Start a CLI command lifecycle (used internally by {@link setupEvlog}).
 */
export function startCliCommand(ctx: CliContext, options: BaseEvlogOptions = {}) {
  return integration.start(ctx, options)
}

/**
 * Level 0 — create a standalone command logger without global bootstrap.
 *
 * Use in published libraries so the host app owns `initLogger` / drain config.
 */
export function createCommandLogger(
  options: CreateCommandLoggerOptions & BaseEvlogOptions,
): AuditableLogger {
  const { command, argv, flags, version, ...middlewareOptions } = options
  const ctx: CliContext = { command, argv, flags }
  const handle = integration.start(ctx, middlewareOptions)

  if (!handle.skipped) {
    applyCliContext(handle.logger, { command, argv, flags, version })
  }

  return handle.logger as AuditableLogger
}

export { integration }
