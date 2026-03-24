/**
 * Nitro runtime modules resolved via dynamic `import()` (Workers-safe: avoids a bundler-injected
 * `createRequire` polyfill from sync `require()`). Module namespaces are cached after first
 * successful load; `useRuntimeConfig()` is still invoked on each call so config stays current.
 *
 * Drain handlers remain non-blocking for the HTTP response when the host provides `waitUntil`
 * (see Nitro plugin); the extra `await` here only sequences work inside that background drain.
 */
let nitropackRuntime: typeof import('nitropack/runtime') | null | undefined
let nitroV3Runtime: typeof import('nitro/runtime-config') | null | undefined

export async function getRuntimeConfig(): Promise<Record<string, any> | undefined> {
  if (nitropackRuntime === undefined) {
    try {
      nitropackRuntime = await import('nitropack/runtime')
    } catch {
      nitropackRuntime = null
    }
  }
  if (nitropackRuntime) {
    return nitropackRuntime.useRuntimeConfig()
  }

  if (nitroV3Runtime === undefined) {
    try {
      nitroV3Runtime = await import('nitro/runtime-config')
    } catch {
      nitroV3Runtime = null
    }
  }
  if (nitroV3Runtime) {
    return nitroV3Runtime.useRuntimeConfig()
  }
  return undefined
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
