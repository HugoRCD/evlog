/**
 * Next.js helper that wires the local stream server into the standard
 * `instrumentation.ts` pattern. Auto-starts the mini stream server in dev
 * and registers its drain so every wide event reaches subscribed clients.
 *
 * @example
 * ```ts
 * // lib/evlog.ts
 * import { defineStreamedInstrumentation } from 'evlog/next/stream'
 *
 * export const { register, onRequestError } = defineStreamedInstrumentation({
 *   service: 'my-app',
 * })
 * ```
 *
 * ```ts
 * // instrumentation.ts
 * import { defineNodeInstrumentation } from 'evlog/next/instrumentation'
 *
 * export const { register, onRequestError } = defineNodeInstrumentation(() =>
 *   import('./lib/evlog')
 * )
 * ```
 *
 * In dev: the mini server boots on first `register()` call and prints
 * `[evlog] Stream → http://127.0.0.1:<port>`. In production the helper
 * is a no-op unless `stream: true` (or a config object) is passed
 * explicitly.
 */

import { startStreamServer, type StreamServerOptions } from '../stream'
import type { DrainContext } from '../types'
import { createInstrumentation, type InstrumentationOptions } from './instrumentation'

export interface StreamedInstrumentationOptions extends InstrumentationOptions {
  /**
   * Live stream server.
   *
   * - `true` — enable with defaults
   * - `false` — explicit off
   * - `StreamServerOptions` — full config (port, host, token, ...)
   * - `undefined` (default) — auto-enabled when `process.env.NODE_ENV === 'development'`
   */
  stream?: boolean | StreamServerOptions
}

interface InstrumentationResult {
  register: () => Promise<void>
  onRequestError: ReturnType<typeof createInstrumentation>['onRequestError']
}

/**
 * Drop-in replacement for `createInstrumentation` that adds the local
 * stream server lifecycle.
 */
export function defineStreamedInstrumentation(options: StreamedInstrumentationOptions = {}): InstrumentationResult {
  const { stream: streamOpt, drain: userDrain, ...rest } = options

  function shouldStartServer(): boolean {
    if (streamOpt === true) return true
    if (streamOpt === false) return false
    if (streamOpt && typeof streamOpt === 'object') return true
    return process.env.NODE_ENV === 'development'
  }

  const start: boolean = shouldStartServer()
  let serverDrain: ((ctx: DrainContext) => void | Promise<void>) | null = null

  async function register(): Promise<void> {
    if (start) {
      const cfg: StreamServerOptions = streamOpt && typeof streamOpt === 'object' ? streamOpt : {}
      try {
        const server = await startStreamServer(cfg)
        serverDrain = ctx => server.drain(ctx)
      } catch (err) {
        console.error('[evlog/next] failed to start stream server:', err)
      }
    }

    const composedDrain = composeDrains(userDrain, serverDrain)
    const inner = createInstrumentation({ ...rest, drain: composedDrain })
    inner.register()
  }

  // We intentionally instantiate a "zero-time" inner just for onRequestError —
  // it wires `log.error` which doesn't depend on the drain.
  const errorOnly = createInstrumentation({ ...rest })

  return {
    register,
    onRequestError: errorOnly.onRequestError,
  }
}

function composeDrains(
  user: ((ctx: DrainContext) => void | Promise<void>) | undefined,
  server: ((ctx: DrainContext) => void | Promise<void>) | null,
): ((ctx: DrainContext) => void | Promise<void>) | undefined {
  if (!user && !server) return undefined
  if (!user) return server!
  if (!server) return user
  return async (ctx) => {
    await Promise.all([
      Promise.resolve(user(ctx)),
      Promise.resolve(server(ctx)),
    ])
  }
}
