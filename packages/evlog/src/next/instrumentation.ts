import type { DrainContext, EnvironmentContext, SamplingConfig } from '../types'
import { initLogger, log, _lockLogger } from '../logger'

export interface InstrumentationOptions {
  /** Enable or disable all logging globally. @default true */
  enabled?: boolean
  /** Service name for all logged events. */
  service?: string
  /** Environment context overrides. */
  env?: Partial<EnvironmentContext>
  /** Enable pretty printing. @default true in development */
  pretty?: boolean
  /** Suppress built-in console output. @default false */
  silent?: boolean
  /** Sampling configuration for filtering logs. */
  sampling?: SamplingConfig
  /** When pretty is disabled, emit JSON strings or raw objects. @default true */
  stringify?: boolean
  /** Drain callback called with every emitted event. */
  drain?: (ctx: DrainContext) => void | Promise<void>
  /** Capture stdout/stderr output as log events (Node.js only). */
  captureOutput?: boolean
}

interface InstrumentationResult {
  register: () => void
  onRequestError: (
    error: { digest?: string } & Error,
    request: { path: string; method: string; headers: Record<string, string> },
    context: { routerKind: string; routePath: string; routeType: string; renderSource: string },
  ) => void
}

let patching = false

export function createInstrumentation(options: InstrumentationOptions = {}): InstrumentationResult {
  let registered = false

  function register(): void {
    if (registered) return
    registered = true

    initLogger({
      enabled: options.enabled,
      env: {
        service: options.service,
        ...options.env,
      },
      pretty: options.pretty,
      silent: options.silent,
      sampling: options.sampling,
      stringify: options.stringify,
      drain: options.drain,
    })
    _lockLogger()

    if (options.captureOutput && process.env.NEXT_RUNTIME === 'nodejs') {
      patchOutput()
    }
  }

  function patchOutput(): void {
    const proc = globalThis.process
    const originalStdoutWrite = proc.stdout.write.bind(proc.stdout)
    const originalStderrWrite = proc.stderr.write.bind(proc.stderr)

    proc.stdout.write = function (chunk: unknown, ...args: unknown[]): boolean {
      if (!patching) {
        patching = true
        try {
          log.info({ source: 'stdout', message: String(chunk).trimEnd() })
        } finally {
          patching = false
        }
      }
      return originalStdoutWrite(chunk, ...args as [])
    } as typeof process.stdout.write

    proc.stderr.write = function (chunk: unknown, ...args: unknown[]): boolean {
      if (!patching) {
        patching = true
        try {
          log.error({ source: 'stderr', message: String(chunk).trimEnd() })
        } finally {
          patching = false
        }
      }
      return originalStderrWrite(chunk, ...args as [])
    } as typeof process.stderr.write
  }

  function onRequestError(
    error: { digest?: string } & Error,
    request: { path: string; method: string; headers: Record<string, string> },
    context: { routerKind: string; routePath: string; routeType: string; renderSource: string },
  ): void {
    log.error({
      message: error.message,
      digest: error.digest,
      stack: error.stack,
      path: request.path,
      method: request.method,
      routerKind: context.routerKind,
      routePath: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource,
    })
  }

  return { register, onRequestError }
}
