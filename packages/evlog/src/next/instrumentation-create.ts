import type { DrainContext, EnvironmentContext, LogLevel, Log, SamplingConfig } from '../types'
import type {
  NextInstrumentationErrorContext,
  NextInstrumentationRequest,
} from './instrumentation-gate'

type LoggerModule = typeof import('../logger')

/** Options for capturing process stdout/stderr as structured log events. */
export interface CaptureOutputOptions {
  /** Capture stdout writes. @default true */
  stdout?: boolean
  /** Capture stderr writes. @default true */
  stderr?: boolean
  /**
   * Skip re-emitting chunks that match these patterns as log events.
   * When omitted, known Next.js Edge bundler warnings are ignored by default.
   */
  ignore?: Array<string | RegExp>
}

/** Default patterns skipped by {@link CaptureOutputOptions.ignore}. */
export const DEFAULT_CAPTURE_OUTPUT_IGNORE: Array<string | RegExp> = [
  'node-module-in-edge-runtime',
  'Edge Instrumentation',
  'https://nextjs.org/docs/messages/node-module-in-edge-runtime',
  'https://nextjs.org/docs/api-reference/edge-runtime',
  'Ecmascript file had an error',
  'A Node.js module is loaded',
  'A Node.js API is used',
  'not supported in the Edge Runtime',
  'not supported inthe Edge Runtime',
  'Import trace:',
]

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
  /** Minimum severity for the global `log` API. @default 'debug' */
  minLevel?: LogLevel
  /** When pretty is disabled, emit JSON strings or raw objects. @default true */
  stringify?: boolean
  /** Drain callback called with every emitted event. */
  drain?: (ctx: DrainContext) => void | Promise<void>
  /** Capture stdout/stderr as structured log events (Node.js only). */
  captureOutput?: boolean | CaptureOutputOptions
}

interface InstrumentationResult {
  register: () => void | Promise<void>
  onRequestError: (
    error: { digest?: string } & Error,
    request: NextInstrumentationRequest,
    context: NextInstrumentationErrorContext,
  ) => void | Promise<void>
}

let patching = false
let loggerPromise: Promise<LoggerModule> | undefined

function loadLogger(): Promise<LoggerModule> {
  loggerPromise ??= import('../logger')
  return loggerPromise
}

function resolveCaptureOutputOptions(
  captureOutput: InstrumentationOptions['captureOutput'],
): CaptureOutputOptions | undefined {
  if (!captureOutput) return undefined
  if (captureOutput === true) {
    return { stdout: true, stderr: true, ignore: DEFAULT_CAPTURE_OUTPUT_IGNORE }
  }
  return {
    stdout: captureOutput.stdout ?? true,
    stderr: captureOutput.stderr ?? true,
    ignore: captureOutput.ignore ?? DEFAULT_CAPTURE_OUTPUT_IGNORE,
  }
}

function shouldIgnoreCapturedOutput(message: string, ignore: Array<string | RegExp>): boolean {
  return ignore.some((pattern) => {
    if (typeof pattern === 'string') return message.includes(pattern)
    return pattern.test(message)
  })
}

/**
 * Create Next.js instrumentation hooks (`register`, `onRequestError`).
 *
 * Load via dynamic `import()` from root `instrumentation.ts` (Node.js runtime only).
 * Load via dynamic `import()` from root `instrumentation.ts` with {@link defineNodeInstrumentation}.
 */
export function createInstrumentation(options: InstrumentationOptions = {}): InstrumentationResult {
  let registered = false
  const captureOutputOptions = resolveCaptureOutputOptions(options.captureOutput)

  function register(): void | Promise<void> {
    if (registered) return
    registered = true

    return loadLogger().then(({ initLogger, lockLogger, log }) => {
      initLogger({
        enabled: options.enabled,
        env: {
          service: options.service,
          ...options.env,
        },
        pretty: options.pretty,
        silent: options.silent,
        sampling: options.sampling,
        minLevel: options.minLevel,
        stringify: options.stringify,
        drain: options.drain,
      })
      lockLogger()

      if (captureOutputOptions && process.env.NEXT_RUNTIME === 'nodejs') {
        patchOutput(captureOutputOptions, log)
      }
    })
  }

  function patchOutput(config: CaptureOutputOptions, logApi: Log): void {
    const proc = globalThis.process
    const originalStdoutWrite = proc.stdout.write.bind(proc.stdout)
    const originalStderrWrite = proc.stderr.write.bind(proc.stderr)
    const ignore = config.ignore ?? DEFAULT_CAPTURE_OUTPUT_IGNORE

    if (config.stdout !== false) {
      proc.stdout.write = function(chunk: unknown, ...args: unknown[]): boolean {
        const message = String(chunk).trimEnd()
        if (!patching && message.length > 0 && !shouldIgnoreCapturedOutput(message, ignore)) {
          patching = true
          try {
            logApi.info({ source: 'stdout', message })
          } finally {
            patching = false
          }
        }
        return originalStdoutWrite(chunk as string, ...args as [])
      } as typeof process.stdout.write
    }

    if (config.stderr !== false) {
      proc.stderr.write = function(chunk: unknown, ...args: unknown[]): boolean {
        const message = String(chunk).trimEnd()
        if (!patching && message.length > 0 && !shouldIgnoreCapturedOutput(message, ignore)) {
          patching = true
          try {
            logApi.error({ source: 'stderr', message })
          } finally {
            patching = false
          }
        }
        return originalStderrWrite(chunk as string, ...args as [])
      } as typeof process.stderr.write
    }
  }

  function onRequestError(
    error: { digest?: string } & Error,
    request: { path: string; method: string; headers: Record<string, string> },
    context: { routerKind: string; routePath: string; routeType: string; renderSource: string },
  ): void | Promise<void> {
    return loadLogger().then(({ log }) => {
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
    })
  }

  return { register, onRequestError }
}
