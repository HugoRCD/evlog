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
