import {
  initLogger,
  log,
  toLoggerConfig,
  toMiddlewareOptions,
  withAuditMethods,
} from 'evlog'
import type { AuditInput, AuditableLogger } from 'evlog'
import { applyCliContext } from './enrichers'
import { parseCliError, exitWithError } from './errors'
import { installFlushOnExit, resolveFlushFn } from './flush'
import { startCliCommand, useLogger } from './integration'
import { logToConsoleFlags, shouldLogToConsole } from './presentation'
import { cliRedactPreset, resolveCliRedact } from './redact'
import type {
  EvlogSetup,
  EvlogSetupConfig,
  InvokeOptions,
} from './types'

export type {
  CliContext,
  CreateCommandLoggerOptions,
  EvlogSetup,
  EvlogSetupConfig,
  InvokeOptions,
  ParsedCliError,
} from './types'

export { cliRedactPreset, resolveCliRedact } from './redact'
export { buildCliContext, applyCliContext } from './enrichers'
export { parseCliError, exitWithError } from './errors'
export { evlogLogArg } from './presentation'
export { createCommandLogger, useLogger } from './integration'

function bootstrapLogger(config: EvlogSetupConfig, argv: string[]): void {
  const logToConsole = shouldLogToConsole(argv, config.logToConsole)
  const redact = resolveCliRedact(config.redact ?? true)

  initLogger({
    ...toLoggerConfig({ ...config, redact }),
    ...logToConsoleFlags(logToConsole),
    env: {
      ...config.env,
      service: config.service ?? config.env?.service ?? 'cli',
      environment: config.environment ?? config.env?.environment,
      version: config.version ?? config.env?.version,
    },
    _suppressDrainWarning: !logToConsole,
  })
}

/**
 * Configure evlog for your CLI: drain, redact, flush-on-exit, errorCatalog, auditCatalog,
 * and command lifecycle via {@link EvlogSetup.invoke}.
 *
 * Does not replace your CLI — pass the returned handle to {@link runMain}
 * from `@evlog/cli/citty` and use {@link useLogger} inside command handlers.
 */
export function setupEvlog(config: EvlogSetupConfig): EvlogSetup {
  const middlewareOptions = toMiddlewareOptions({ ...config, redact: resolveCliRedact(config.redact ?? true) })
  const flushFn = resolveFlushFn(config.drain)

  bootstrapLogger(config, process.argv.slice(2))

  if (flushFn && config.flushOnExit !== false) {
    installFlushOnExit(flushFn)
  }

  async function invoke<T>(
    options: InvokeOptions,
    fn: (commandLog: AuditableLogger) => T | Promise<T>,
  ): Promise<T> {
    bootstrapLogger(config, options.argv ?? process.argv.slice(2))

    const ctx = {
      command: options.command,
      argv: options.argv,
      flags: options.flags,
    }

    const { skipped, finish, runWith, logger } = startCliCommand(ctx, middlewareOptions)

    if (skipped) {
      return await fn(withAuditMethods(logger))
    }

    applyCliContext(logger, {
      command: options.command,
      argv: options.argv,
      flags: options.flags,
      version: config.version,
    })

    const auditable = withAuditMethods(logger)

    try {
      const result = await runWith(() => fn(auditable))
      if (!options.longRunning) {
        await finish({ status: 0 })
      }
      return result
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      await finish({ error: err })
      throw error
    }
  }

  function audit(input: AuditInput): void {
    withAuditMethods(useLogger()).audit(input)
  }

  async function flush(): Promise<void> {
    if (flushFn) await flushFn()
  }

  return {
    invoke,
    log,
    errorCatalog: config.errorCatalog,
    auditCatalog: config.auditCatalog,
    audit,
    flush,
  }
}
