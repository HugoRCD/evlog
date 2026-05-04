import { getNitroRuntimeConfigRecord } from './nitroConfigBridge'

/**
 * Adapter runtime-config resolution.
 *
 * Reads go through `getNitroRuntimeConfigRecord` (Workers-safe dynamic imports).
 * Drain handlers remain non-blocking when the host provides `waitUntil`.
 *
 * @beta Part of `evlog/toolkit` — used by every built-in adapter. Community
 * adapters get the same env / Nitro runtimeConfig priority chain by calling
 * `resolveAdapterConfig`.
 */

/**
 * Read the full Nitro `useRuntimeConfig()` record (or `undefined` outside Nitro).
 *
 * Most adapters do not need to call this directly — prefer `resolveAdapterConfig`.
 *
 * @beta Part of `evlog/toolkit`.
 */
export function getRuntimeConfig(): Promise<Record<string, any> | undefined> {
  return getNitroRuntimeConfigRecord()
}

/**
 * Description of a single adapter config field for `resolveAdapterConfig`.
 *
 * `key` is the field name in the resolved config. `env` is the ordered list
 * of environment variables to fall back to (`['NUXT_AXIOM_TOKEN', 'AXIOM_TOKEN']`).
 *
 * @beta Part of `evlog/toolkit`.
 */
export interface ConfigField<T> {
  key: keyof T & string
  env?: string[]
}

/**
 * Resolve adapter configuration with the standard evlog priority chain:
 *
 * 1. `overrides` passed to the drain factory
 * 2. `runtimeConfig.evlog.{namespace}.{key}` (Nitro)
 * 3. `runtimeConfig.{namespace}.{key}` (Nitro)
 * 4. `process.env[envKey]` for each env in `field.env`
 *
 * @beta Part of `evlog/toolkit` — the canonical way to wire a drain into evlog's
 * config priority. Use this in any community adapter that needs env-based
 * zero-config setup.
 */
export async function resolveAdapterConfig<T>(
  namespace: string,
  fields: ConfigField<T>[],
  overrides?: Partial<T>,
): Promise<Partial<T>> {
  const runtimeConfig = shouldProbeRuntimeConfig(fields, overrides)
    ? await getRuntimeConfig()
    : undefined
  const evlogNs = runtimeConfig?.evlog?.[namespace]
  const rootNs = runtimeConfig?.[namespace]

  const config: Record<string, unknown> = {}

  for (const { key, env } of fields) {
    config[key] =
      overrides?.[key]
      ?? evlogNs?.[key]
      ?? rootNs?.[key]
      ?? resolveEnv(env)
  }

  return config as Partial<T>
}

function shouldProbeRuntimeConfig<T>(
  fields: ConfigField<T>[],
  overrides?: Partial<T>,
): boolean {
  // Optional tuning fields (e.g. timeout/retries) should not trigger Nitro
  // virtual-module imports when env/overrides already resolve the env-backed
  // adapter fields in non-Nitro runtimes.
  return fields.some(({ key, env }) => {
    if (overrides?.[key] !== undefined) return false
    if (!env) return false
    return resolveEnv(env) === undefined
  })
}

function resolveEnv(envKeys?: string[]): string | undefined {
  if (!envKeys) return undefined
  for (const key of envKeys) {
    const val = process.env[key]
    if (val) return val
  }
  return undefined
}
