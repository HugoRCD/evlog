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
 * 1. Build-time inlined config literal — baked in via `nitro.options.replace`
 *    by the evlog Nitro modules. When present, all runtime probing is skipped
 *    (see issue #312: Vercel + Bun crashes if the v3 probe runs).
 * 2. `process.env.__EVLOG_CONFIG` — JSON set by evlog Nitro modules during
 *    build; survives into runtime on platforms that propagate build env vars.
 * 3. Computed module IDs — `['a','b'].join('/')` passed to `import()` so emitted
 *    JS does not contain a static `import("a/b")`.
 * 4. Plugins call {@link setActiveNitroRuntime} so adapters never probe modules
 *    from the other major version.
 * 5. When the active runtime is unknown (standalone use outside a Nitro
 *    plugin), the bridge falls back to the historical probe order.
 *
 * Not exported from `evlog/toolkit` — package-internal only.
 */

import type { NitroPluginEvlogConfig } from '../nitro'

type EvlogConfig = NitroPluginEvlogConfig

const EVLOG_NITRO_ENV = '__EVLOG_CONFIG' as const

// Replaced at build time by `nitro.options.replace` in the evlog Nitro
// modules. Outside of a Nitro build, this identifier is undeclared and the
// `typeof` guard below evaluates safely.
// eslint-disable-next-line @typescript-eslint/naming-convention
declare const __EVLOG_CONFIG__: EvlogConfig | undefined

/** Build-time inlined config, or `undefined` if the bundle was not produced by an evlog Nitro module. */
export function readEvlogConfigFromInline(): EvlogConfig | undefined {
  if (typeof __EVLOG_CONFIG__ === 'undefined') return undefined
  if (__EVLOG_CONFIG__ === null || typeof __EVLOG_CONFIG__ !== 'object') return undefined
  return __EVLOG_CONFIG__
}

type NitroMajor = 'v2' | 'v3'

let activeNitroRuntime: NitroMajor | undefined

/**
 * Declare the active Nitro major version so adapters never probe the other
 * version's modules at runtime. The evlog Nitro plugins call this in their
 * first synchronous statement.
 *
 * Bun's auto-install behavior writes to `node_modules/.cache` whenever a
 * dynamic import targets a missing package, which crashes on Vercel's
 * read-only function filesystem. Restricting probes to the runtime that is
 * actually installed avoids that path entirely.
 */
export function setActiveNitroRuntime(version: NitroMajor): void {
  activeNitroRuntime = version
}

/** @internal Reset the active runtime declaration. Used by tests only. */
export function resetActiveNitroRuntime(): void {
  activeNitroRuntime = undefined
}

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

/**
 * Synchronous evlog config for hot paths (error handler overlay, etc.).
 * Matches {@link resolveEvlogConfigForNitroPlugin} steps 1–2 only.
 */
export function readEvlogConfigSync(): EvlogConfig | undefined {
  return readEvlogConfigFromInline() ?? readEvlogConfigFromNitroEnv()
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
 *
 * Lookup order:
 * 1. {@link readEvlogConfigFromInline} — build-time literal inlined by the
 *    evlog Nitro module. Hits in every deployed bundle and skips runtime
 *    probing entirely.
 * 2. `process.env.__EVLOG_CONFIG`
 * 3. The active runtime declared by {@link setActiveNitroRuntime} — either
 *    Nitro v3 `runtime-config` or nitropack internal config, never both.
 * 4. When no active runtime has been declared (standalone use): probe v3 then
 *    nitropack v2 as a best-effort fallback.
 */
export async function resolveEvlogConfigForNitroPlugin(): Promise<EvlogConfig | undefined> {
  const fromInline = readEvlogConfigFromInline()
  if (fromInline !== undefined) return fromInline

  const fromEnv = readEvlogConfigFromNitroEnv()
  if (fromEnv !== undefined) return fromEnv

  if (activeNitroRuntime === 'v3') {
    const v3 = await getNitroV3Runtime()
    if (v3) {
      const slice = evlogSlice(v3.useRuntimeConfig())
      if (slice !== undefined) return slice
    }
    return undefined
  }

  if (activeNitroRuntime === 'v2') {
    const internal = await getNitropackInternalRuntimeConfig()
    if (internal) {
      const slice = evlogSlice(internal.useRuntimeConfig())
      if (slice !== undefined) return slice
    }
    return undefined
  }

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
 * Full `useRuntimeConfig()` object for drain adapters.
 *
 * Honors {@link setActiveNitroRuntime}: when a Nitro plugin has declared its
 * version, only that version's runtime module is probed. When no version has
 * been declared (standalone use outside Nitro), falls back to the historical
 * order: nitropack v2 first, then Nitro v3.
 *
 * When build-time config was inlined (see {@link readEvlogConfigFromInline}),
 * returns a synthetic `{ evlog: <inlined> }` record so adapters can read
 * `runtimeConfig.evlog.*` without triggering the dynamic import (issue #312).
 */
export async function getNitroRuntimeConfigRecord(): Promise<Record<string, any> | undefined> {
  const inline = readEvlogConfigFromInline()
  if (inline !== undefined) return { evlog: inline }

  if (activeNitroRuntime === 'v3') {
    const v3 = await getNitroV3Runtime()
    return v3 ? v3.useRuntimeConfig() : undefined
  }

  if (activeNitroRuntime === 'v2') {
    const nitropack = await getNitropackRuntime()
    return nitropack ? nitropack.useRuntimeConfig() : undefined
  }

  // Next.js (and other non-Nitro hosts) ship without a Nitro builder — probing
  // nitropack runtime modules only loads stub implementations and warns.
  if (activeNitroRuntime === undefined && process.env.NEXT_RUNTIME !== undefined) {
    return undefined
  }

  const nitropack = await getNitropackRuntime()
  if (nitropack) return nitropack.useRuntimeConfig()

  const v3 = await getNitroV3Runtime()
  if (v3) return v3.useRuntimeConfig()

  return undefined
}
