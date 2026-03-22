/**
 * Try to get runtime config from Nitro/Nuxt environment.
 * Supports both Nitro v2 (nitropack/runtime) and Nitro v3 (nitro/runtime-config).
 * Returns undefined if not in a Nitro context.
 */
export async function getRuntimeConfig(): Promise<Record<string, any> | undefined> {
  try {
    const { useRuntimeConfig } = await import('nitropack/runtime')
    return useRuntimeConfig()
  } catch {
    // nitropack not available — try Nitro v3
  }

  try {
    const { useRuntimeConfig } = await import('nitro/runtime-config')
    return useRuntimeConfig()
  } catch {
    return undefined
  }
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
