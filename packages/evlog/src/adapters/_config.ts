/**
 * Try to get runtime config from Nitro/Nuxt environment.
 * Returns undefined if not in a Nitro context.
 */
export function getRuntimeConfig(): Record<string, any> | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useRuntimeConfig } = require('nitropack/runtime')
    return useRuntimeConfig()
  } catch {
    return undefined
  }
}

export interface ConfigField<T> {
  key: keyof T & string
  env?: string[]
}

export function resolveAdapterConfig<T>(
  namespace: string,
  fields: ConfigField<T>[],
  overrides?: Partial<T>,
): Partial<T> {
  const runtimeConfig = getRuntimeConfig()
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
