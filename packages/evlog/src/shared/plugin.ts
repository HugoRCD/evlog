import type { DrainContext, EnrichContext, EnvironmentContext, RequestLogger, TailSamplingContext, WideEvent } from '../types'

/**
 * Setup context passed to {@link EvlogPlugin.setup}.
 *
 * Called once when the plugin is registered (typically via `initLogger` or
 * `defineEvlog`). Use for one-shot side effects (warming a connection, reading
 * an env var, etc.).
 *
 * @beta Part of `evlog/toolkit`.
 */
export interface PluginSetupContext {
  /** Resolved evlog environment context (service, environment, version, …). */
  env: EnvironmentContext
}

/**
 * Per-request lifecycle context passed to {@link EvlogPlugin.onRequestStart}
 * and {@link EvlogPlugin.onRequestFinish}.
 *
 * @beta Part of `evlog/toolkit`.
 */
export interface RequestLifecycleContext {
  logger: RequestLogger
  request: {
    method: string
    path: string
    requestId?: string
  }
  /** Pre-filtered safe request headers (sensitive headers stripped). */
  headers?: Record<string, string>
}

/**
 * Per-request lifecycle context passed to {@link EvlogPlugin.onRequestFinish}.
 *
 * `event` is the emitted wide event (or `null` if it was sampled out / disabled).
 * `error` is set when the framework caught an exception.
 *
 * @beta Part of `evlog/toolkit`.
 */
export interface RequestFinishContext extends RequestLifecycleContext {
  event: WideEvent | null
  status?: number
  durationMs: number
  error?: Error
}

/**
 * Context passed to {@link EvlogPlugin.onClientLog} when a wide event arrives
 * at the server-side ingest endpoint from a browser/edge client.
 *
 * @beta Part of `evlog/toolkit`.
 */
export interface ClientLogContext {
  /** Raw client payload before being normalized to a wide event. */
  payload: Record<string, unknown>
  request?: {
    method?: string
    path?: string
  }
  headers?: Record<string, string>
}

/**
 * The canonical extension point for evlog.
 *
 * A plugin can opt into any subset of hooks:
 * - `setup` — one-off init when registered
 * - `enrich` / `drain` / `keep` — same semantics as the standalone callbacks but composable
 * - `onRequestStart` / `onRequestFinish` — per-request lifecycle (for tracing,
 *   metrics, request-scoped state)
 * - `onClientLog` — observe events submitted by browser/edge clients
 * - `extendLogger` — decorate the per-request logger with custom methods
 *
 * Drains and enrichers are special cases of plugins: a drain plugin only
 * implements `drain`, an enricher plugin only implements `enrich`. They can
 * also be wrapped with {@link drainPlugin} / {@link enricherPlugin} from a
 * standalone callback for composition.
 *
 * @beta Part of `evlog/toolkit` — the public extension contract for community
 * libraries built on top of evlog.
 *
 * @example
 * ```ts
 * import { definePlugin, useLogger } from 'evlog/toolkit'
 *
 * export const tenantPlugin = definePlugin({
 *   name: 'tenant',
 *   onRequestStart({ logger, headers }) {
 *     const tenantId = headers?.['x-tenant-id']
 *     if (tenantId) logger.set({ tenant: { id: tenantId } })
 *   },
 *   enrich({ event }) {
 *     event.region = process.env.REGION
 *   },
 * })
 * ```
 */
export interface EvlogPlugin {
  /** Stable identifier. Surfaced in logs and used for plugin de-duplication. */
  name: string
  /** Run-once setup when the plugin is registered. */
  setup?: (ctx: PluginSetupContext) => void | Promise<void>
  /** Per-event enrichment hook. Runs before drain. */
  enrich?: (ctx: EnrichContext) => void | Promise<void>
  /** Per-event drain hook. Called for every emitted event. */
  drain?: (ctx: DrainContext) => void | Promise<void>
  /** Tail sampling hook. Set `ctx.shouldKeep = true` to force-keep the event. */
  keep?: (ctx: TailSamplingContext) => void | Promise<void>
  /** Called when a request logger is created, before the handler runs. */
  onRequestStart?: (ctx: RequestLifecycleContext) => void
  /** Called after a request finishes (event emitted, drain attempted). */
  onRequestFinish?: (ctx: RequestFinishContext) => void
  /** Called when a client log arrives at the server-side ingest endpoint. */
  onClientLog?: (ctx: ClientLogContext) => void
  /**
   * Decorate per-request loggers with extra methods (e.g. `log.metric`, `log.feature`).
   *
   * @remarks
   * To get type-safe access to the new methods on `useLogger()`, augment
   * `RequestLogger` via TypeScript module augmentation in your plugin's `.d.ts`.
   */
  extendLogger?: (logger: RequestLogger) => void
}

/**
 * Identity helper for authoring evlog plugins with full type inference.
 *
 * @beta Part of `evlog/toolkit`.
 */
export function definePlugin(plugin: EvlogPlugin): EvlogPlugin {
  return plugin
}

/**
 * Wrap a standalone drain callback as an {@link EvlogPlugin} so it can be
 * registered via `defineEvlog({ plugins: [...] })` alongside other plugins.
 *
 * @beta Part of `evlog/toolkit`.
 */
export function drainPlugin(name: string, drain: NonNullable<EvlogPlugin['drain']>): EvlogPlugin {
  return { name, drain }
}

/**
 * Wrap a standalone enricher callback as an {@link EvlogPlugin}.
 *
 * @beta Part of `evlog/toolkit`.
 */
export function enricherPlugin(name: string, enrich: NonNullable<EvlogPlugin['enrich']>): EvlogPlugin {
  return { name, enrich }
}

/**
 * Compiled view of a plugin set, ready to be invoked by the runtime.
 *
 * Errors from individual plugin hooks are captured and logged to `console.error`
 * with the plugin name; they never break the request.
 *
 * @beta Part of `evlog/toolkit`.
 */
export interface PluginRunner {
  /** Plugins as registered. Useful for diagnostics. */
  readonly plugins: readonly EvlogPlugin[]
  /** `true` when at least one plugin implements the matching hook. */
  readonly hasEnrich: boolean
  readonly hasDrain: boolean
  readonly hasKeep: boolean
  readonly hasRequestLifecycle: boolean
  readonly hasClientLog: boolean
  readonly hasExtendLogger: boolean
  /** Apply every plugin's `extendLogger` to the given logger (mutates). */
  applyExtendLogger: (logger: RequestLogger) => void
  /** Run every plugin's `onRequestStart` hook. */
  runOnRequestStart: (ctx: RequestLifecycleContext) => void
  /** Run every plugin's `onRequestFinish` hook. */
  runOnRequestFinish: (ctx: RequestFinishContext) => void
  /** Run every plugin's `enrich` hook in registration order. */
  runEnrich: (ctx: EnrichContext) => Promise<void>
  /** Run every plugin's `drain` hook concurrently (allSettled). */
  runDrain: (ctx: DrainContext) => Promise<void>
  /** Run every plugin's `keep` hook in registration order. */
  runKeep: (ctx: TailSamplingContext) => Promise<void>
  /** Run every plugin's `onClientLog` hook. */
  runOnClientLog: (ctx: ClientLogContext) => void
  /** Run every plugin's `setup` hook (idempotent, awaited). */
  runSetup: (ctx: PluginSetupContext) => Promise<void>
}

function logPluginError(name: string, hook: string, err: unknown): void {
  console.error(`[evlog/${name}] ${hook} failed:`, err)
}

/**
 * Build a {@link PluginRunner} from a list of plugins. De-duplicates by `name`
 * (last registration wins for the same name).
 *
 * @beta Part of `evlog/toolkit`.
 */
export function createPluginRunner(plugins: EvlogPlugin[] = []): PluginRunner {
  const byName = new Map<string, EvlogPlugin>()
  for (const plugin of plugins) {
    byName.set(plugin.name, plugin)
  }
  const list = Array.from(byName.values())

  const hasEnrich = list.some(p => typeof p.enrich === 'function')
  const hasDrain = list.some(p => typeof p.drain === 'function')
  const hasKeep = list.some(p => typeof p.keep === 'function')
  const hasRequestLifecycle = list.some(
    p => typeof p.onRequestStart === 'function' || typeof p.onRequestFinish === 'function',
  )
  const hasClientLog = list.some(p => typeof p.onClientLog === 'function')
  const hasExtendLogger = list.some(p => typeof p.extendLogger === 'function')

  return {
    plugins: list,
    hasEnrich,
    hasDrain,
    hasKeep,
    hasRequestLifecycle,
    hasClientLog,
    hasExtendLogger,
    applyExtendLogger(logger) {
      for (const plugin of list) {
        if (!plugin.extendLogger) continue
        try {
          plugin.extendLogger(logger)
        } catch (err) {
          logPluginError(plugin.name, 'extendLogger', err)
        }
      }
    },
    runOnRequestStart(ctx) {
      for (const plugin of list) {
        if (!plugin.onRequestStart) continue
        try {
          plugin.onRequestStart(ctx)
        } catch (err) {
          logPluginError(plugin.name, 'onRequestStart', err)
        }
      }
    },
    runOnRequestFinish(ctx) {
      for (const plugin of list) {
        if (!plugin.onRequestFinish) continue
        try {
          plugin.onRequestFinish(ctx)
        } catch (err) {
          logPluginError(plugin.name, 'onRequestFinish', err)
        }
      }
    },
    async runEnrich(ctx) {
      for (const plugin of list) {
        if (!plugin.enrich) continue
        try {
          await plugin.enrich(ctx)
        } catch (err) {
          logPluginError(plugin.name, 'enrich', err)
        }
      }
    },
    async runDrain(ctx) {
      const drains = list.filter(p => typeof p.drain === 'function')
      if (drains.length === 0) return
      await Promise.allSettled(
        drains.map(async (plugin) => {
          try {
            await plugin.drain!(ctx)
          } catch (err) {
            logPluginError(plugin.name, 'drain', err)
          }
        }),
      )
    },
    async runKeep(ctx) {
      for (const plugin of list) {
        if (!plugin.keep) continue
        try {
          await plugin.keep(ctx)
        } catch (err) {
          logPluginError(plugin.name, 'keep', err)
        }
      }
    },
    runOnClientLog(ctx) {
      for (const plugin of list) {
        if (!plugin.onClientLog) continue
        try {
          plugin.onClientLog(ctx)
        } catch (err) {
          logPluginError(plugin.name, 'onClientLog', err)
        }
      }
    },
    async runSetup(ctx) {
      for (const plugin of list) {
        if (!plugin.setup) continue
        try {
          await plugin.setup(ctx)
        } catch (err) {
          logPluginError(plugin.name, 'setup', err)
        }
      }
    },
  }
}

const emptyRunner = createPluginRunner([])

/**
 * Shared no-op runner used when no plugins are registered.
 *
 * @beta Part of `evlog/toolkit` — internal optimization, exported for tests.
 */
export function getEmptyPluginRunner(): PluginRunner {
  return emptyRunner
}
