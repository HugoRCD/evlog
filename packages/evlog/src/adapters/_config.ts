import { getNitroRuntimeConfigRecord } from '../shared/nitroConfigBridge'

/**
 * Adapter runtime-config reads go through `getNitroRuntimeConfigRecord` in
 * `shared/nitroConfigBridge.ts` (documented there — Workers-safe dynamic imports).
 *
 * Drain handlers remain non-blocking when the host provides `waitUntil`.
 */

export function getRuntimeConfig(): Promise<Record<string, any> | undefined> {
  return getNitroRuntimeConfigRecord()
}

export interface ConfigField<T> {
  key: keyof T & string
  env?: string[]
}

export async function resolveAdapterConfig<T>(
  namespace: string,
  fields: ConfigField<T>[],
  overrides?: Partial<T>,
): Promise<Partial<T>> {
  const runtimeConfig = await getRuntimeConfig()
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

function resolveEnv(envKeys?: string[]): string | undefined {
  if (!envKeys) return undefined
  for (const key of envKeys) {
    const val = process.env[key]
    if (val) return val
  }
  return undefined
}
