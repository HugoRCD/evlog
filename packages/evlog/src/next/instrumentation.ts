import type { DrainContext, EnvironmentContext, SamplingConfig } from '../types'
import { initLogger, log, lockLogger } from '../logger'

/** Request payload passed to Next.js `onRequestError` (App Router). */
export interface NextInstrumentationRequest {
  path: string
  method: string
  headers: Record<string, string>
}

/** Routing context passed to Next.js `onRequestError`. */
export interface NextInstrumentationErrorContext {
  routerKind: string
  routePath: string
  routeType: string
  renderSource: string
}

/**
 * What `lib/evlog.ts` should export for use with {@link defineNodeInstrumentation}
 * (typically the return values of `createInstrumentation()`).
 */
export interface NodeInstrumentationModule {
  register: () => void | Promise<void>
  onRequestError: (
    error: { digest?: string } & Error,
    request: NextInstrumentationRequest,
    context: NextInstrumentationErrorContext,
  ) => void | Promise<void>
}

/**
 * Root `instrumentation.ts` entry: load your real config only in the Node.js runtime so Edge
 * bundles never pull Node-only drains/adapters. Caches the dynamic `import()` so `register` and
 * repeated `onRequestError` calls share one module instance (avoids re-importing on every error).
 *
 * @example
 * ```ts
 * // instrumentation.ts
 * import { defineNodeInstrumentation } from 'evlog/next/instrumentation'
 *
 * export const { register, onRequestError } = defineNodeInstrumentation(() => import('./lib/evlog'))
 * ```
 */
export function defineNodeInstrumentation(loader: () => Promise<NodeInstrumentationModule>) {
  let cached: Promise<NodeInstrumentationModule> | undefined

  function load(): Promise<NodeInstrumentationModule> {
    cached ??= loader()
    return cached
  }

  return {
    async register() {
      if (process.env.NEXT_RUNTIME !== 'nodejs') return
      const mod = await load()
      await mod.register()
    },
    async onRequestError(
      error: { digest?: string } & Error,
      request: NextInstrumentationRequest,
      context: NextInstrumentationErrorContext,
    ) {
      if (process.env.NEXT_RUNTIME !== 'nodejs') return
      const mod = await load()
      await mod.onRequestError(error, request, context)
    },
  }
}

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
    request: NextInstrumentationRequest,
    context: NextInstrumentationErrorContext,
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
    lockLogger()

    if (options.captureOutput && process.env.NEXT_RUNTIME === 'nodejs') {
      patchOutput()
    }
  }

  function patchOutput(): void {
    const proc = globalThis.process
    const originalStdoutWrite = proc.stdout.write.bind(proc.stdout)
    const originalStderrWrite = proc.stderr.write.bind(proc.stderr)

    proc.stdout.write = function(chunk: unknown, ...args: unknown[]): boolean {
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

    proc.stderr.write = function(chunk: unknown, ...args: unknown[]): boolean {
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
