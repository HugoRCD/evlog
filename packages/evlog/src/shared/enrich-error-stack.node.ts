/** Options for {@link enrichErrorStackForDev}. */
export interface EnrichErrorStackOptions {
  /** When false, skip Nitro source-map stack enrichment. @default true in dev when pretty is enabled */
  pretty?: boolean
}

function shouldEnrichStackFromConfig(): boolean {
  try {
    const raw = process.env.__EVLOG_CONFIG
    if (raw) {
      const config = JSON.parse(raw) as { pretty?: boolean }
      return config.pretty ?? process.env.NODE_ENV !== 'production'
    }
  } catch {
    // ignore malformed config
  }
  return process.env.NODE_ENV !== 'production'
}

function isNextDevRuntime(): boolean {
  return process.env.NEXT_RUNTIME === 'nodejs'
    || process.env.NEXT_RUNTIME === 'edge'
    || Boolean(process.env.__NEXT_DIST_DIR)
}

async function enrichErrorStackFromNitroDev(error: Error): Promise<boolean> {
  if (isNextDevRuntime()) return false

  const { createRequire } = await import('node:module')
  const require = createRequire(import.meta.url)
  const specifiers = [
    'nitropack/runtime/internal/error/dev',
    'nitro/runtime/internal/error/dev',
  ]

  for (const specifier of specifiers) {
    try {
      const mod = require(specifier) as { loadStackTrace?: (err: Error) => Promise<void> }
      if (typeof mod.loadStackTrace === 'function') {
        await mod.loadStackTrace(error).catch(() => {})
        return true
      }
    } catch {
      // try next Nitro runtime entry
    }
  }

  return false
}

/**
 * Rewrite `error.stack` with source-mapped frames when the Nitro or Next.js dev runtime is available.
 * Matches Nitro's Youch output (e.g. `server/api/foo.ts:100` instead of `.nuxt/dev/index.mjs`).
 */
export async function enrichErrorStackForDev(
  error: Error,
  options: EnrichErrorStackOptions = {},
): Promise<void> {
  if (process.env.NODE_ENV === 'production') return
  const pretty = options.pretty ?? shouldEnrichStackFromConfig()
  if (!pretty) return

  if (isNextDevRuntime()) {
    const { enrichErrorStackFromNextDev } = await import('./enrich-error-stack-next.node')
    enrichErrorStackFromNextDev(error)
    return
  }

  await enrichErrorStackFromNitroDev(error)
}
