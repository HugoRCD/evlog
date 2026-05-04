/**
 * How evlog reads Nitro runtime config from **published** ESM.
 *
 * **Why not** `import('nitro/runtime-config')` as a string literal in source?
 * Those subpaths are virtual or specially resolved. App Rollup can resolve them
 * for first-party code; for dependency chunks (`node_modules/evlog/dist/...`),
 * strict presets (e.g. `cloudflare-durable`) may fail with “externals are not
 * allowed”. A literal dynamic import is enough for Rollup to pre-resolve.
 *
 * **Strategy**
 *
 * 1. `process.env.__EVLOG_CONFIG` — JSON set by evlog Nitro modules (no virtual
 *    modules; preferred in production Workers builds).
 * 2. Computed module IDs — `['a','b'].join('/')` passed to `import()` so emitted
 *    JS does not contain a static `import("a/b")`.
 * 3. Plugin resolution tries Nitro v3 first, then nitropack internal config (v2).
 * 4. Adapter resolution keeps historical order: nitropack runtime barrel, then v3.
 *
 * Not exported from `evlog/toolkit` — package-internal only.
 */

import type { NitroPluginEvlogConfig } from '../nitro'

type EvlogConfig = NitroPluginEvlogConfig

const EVLOG_NITRO_ENV = '__EVLOG_CONFIG' as const

type NitroRuntimeConfigModule = {
  useRuntimeConfig: () => Record<string, any>
}

function nitroV3RuntimeConfigSpecifier(): string {
  return ['nitro', 'runtime-config'].join('/')
}

function nitropackRuntimeSpecifier(): string {
  return ['nitropack', 'runtime'].join('/')
}

function nitropackInternalRuntimeConfigSpecifier(): string {
  return ['nitropack', 'runtime', 'internal', 'config'].join('/')
}

async function importOrNull(specifier: string): Promise<unknown> {
  try {
    return await import(specifier)
  } catch {
    return null
  }
}

function isRuntimeConfigModule(mod: unknown): mod is NitroRuntimeConfigModule {
  return (
    typeof mod === 'object'
    && mod !== null
    && 'useRuntimeConfig' in mod
    && typeof (mod as NitroRuntimeConfigModule).useRuntimeConfig === 'function'
  )
}

/** Snapshot from env, or `undefined` if unset / invalid JSON. */
export function readEvlogConfigFromNitroEnv(): EvlogConfig | undefined {
  const raw = process.env[EVLOG_NITRO_ENV]
  if (raw === undefined || raw === '') return undefined
  try {
    return JSON.parse(raw) as EvlogConfig
  } catch {
    return undefined
  }
}

let cachedNitropackRuntime: NitroRuntimeConfigModule | null | undefined
let cachedNitroV3Runtime: NitroRuntimeConfigModule | null | undefined
let cachedNitropackInternalConfig: NitroRuntimeConfigModule | null | undefined

async function getNitropackRuntime(): Promise<NitroRuntimeConfigModule | null> {
  if (cachedNitropackRuntime !== undefined) return cachedNitropackRuntime
  const mod = await importOrNull(nitropackRuntimeSpecifier())
  cachedNitropackRuntime = isRuntimeConfigModule(mod) ? mod : null
  return cachedNitropackRuntime
}

async function getNitroV3Runtime(): Promise<NitroRuntimeConfigModule | null> {
  if (cachedNitroV3Runtime !== undefined) return cachedNitroV3Runtime
  const mod = await importOrNull(nitroV3RuntimeConfigSpecifier())
  cachedNitroV3Runtime = isRuntimeConfigModule(mod) ? mod : null
  return cachedNitroV3Runtime
}

async function getNitropackInternalRuntimeConfig(): Promise<NitroRuntimeConfigModule | null> {
  if (cachedNitropackInternalConfig !== undefined) return cachedNitropackInternalConfig
  const mod = await importOrNull(nitropackInternalRuntimeConfigSpecifier())
  cachedNitropackInternalConfig = isRuntimeConfigModule(mod) ? mod : null
  return cachedNitropackInternalConfig
}

function evlogSlice(config: Record<string, any>): EvlogConfig | undefined {
  const { evlog } = config
  if (evlog && typeof evlog === 'object') return evlog as EvlogConfig
  return undefined
}

/**
 * Options for evlog Nitro plugins (nitropack v2 and Nitro v3).
 * Env bridge first; then Nitro v3 `runtime-config`; then nitropack internal config.
 */
export async function resolveEvlogConfigForNitroPlugin(): Promise<EvlogConfig | undefined> {
  const fromEnv = readEvlogConfigFromNitroEnv()
  if (fromEnv !== undefined) return fromEnv

  const v3 = await getNitroV3Runtime()
  if (v3) {
    const slice = evlogSlice(v3.useRuntimeConfig())
    if (slice !== undefined) return slice
  }

  const internal = await getNitropackInternalRuntimeConfig()
  if (internal) {
    const slice = evlogSlice(internal.useRuntimeConfig())
    if (slice !== undefined) return slice
  }

  return undefined
}

/**
 * Full `useRuntimeConfig()` object for drain adapters (nitropack first, then v3).
 */
export async function getNitroRuntimeConfigRecord(): Promise<Record<string, any> | undefined> {
  const nitropack = await getNitropackRuntime()
  if (nitropack) return nitropack.useRuntimeConfig()

  const v3 = await getNitroV3Runtime()
  if (v3) return v3.useRuntimeConfig()

  return undefined
}
