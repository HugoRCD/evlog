import { parse } from 'acorn'
import type { Plugin, ResolvedConfig } from 'vite'
import type { TransformPluginContext } from 'rollup'

type PluginHook<T> = T | { handler: T, filter?: unknown }

/**
 * Unwrap a Vite plugin hook whether it is a bare function or `{ handler }`.
 */
export function getPluginHook<T extends(...args: never[]) => unknown>(
  plugin: Plugin,
  hookName: keyof Plugin,
): T {
  const hook = plugin[hookName] as PluginHook<T> | undefined
  if (!hook) {
    throw new Error(`Plugin hook ${String(hookName)} is undefined`)
  }
  if (typeof hook === 'function') {
    return hook
  }
  if (typeof hook === 'object' && hook !== null && 'handler' in hook) {
    return hook.handler
  }
  throw new Error(`Plugin hook ${String(hookName)} is not callable`)
}

/** Minimal `configResolved` input for plugin tests. */
export function callConfigResolved(plugin: Plugin, config: Pick<ResolvedConfig, 'command'> & Partial<ResolvedConfig>): void {
  const hook = plugin.configResolved
  if (!hook) return
  if (typeof hook === 'function') {
    hook(config as ResolvedConfig)
    return
  }
  hook.handler(config as ResolvedConfig)
}

/** Rollup transform context stub with acorn `parse` — matches Vite's transform hook. */
export function createParseTransformContext(): Pick<TransformPluginContext, 'parse'> {
  return {
    parse(code: string) {
      return parse(code, { ecmaVersion: 'latest', sourceType: 'module' })
    },
  }
}

type TransformResult = { code: string, map?: object } | undefined | null

type PluginTransformHandler = (
  this: TransformPluginContext,
  code: string,
  id: string,
) => TransformResult | Promise<TransformResult>

/** Run a plugin `transform` hook after optional `configResolved`. */
export function runPluginTransform(
  plugin: Plugin,
  code: string,
  id: string,
  options?: { config?: Pick<ResolvedConfig, 'command'> & Partial<ResolvedConfig> },
): TransformResult | Promise<TransformResult> {
  if (options?.config) {
    callConfigResolved(plugin, options.config)
  }
  const handler = getPluginHook<PluginTransformHandler>(plugin, 'transform')
  const ctx = createParseTransformContext() as TransformPluginContext
  return handler.call(ctx, code, id)
}
