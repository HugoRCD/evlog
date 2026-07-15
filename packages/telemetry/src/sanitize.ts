import type { CollectConfig } from './types'

/**
 * Sanitize citty-parsed flags by shape — never reads raw argv.
 * Booleans and numbers: value captured.
 * Strings: presence-only unless allowlisted in `collect.flags`.
 */
export function sanitizeFlags(
  raw: Record<string, unknown> | undefined,
  collect?: CollectConfig,
): Record<string, boolean | number | string> {
  if (!raw) return {}

  const out: Record<string, boolean | number | string> = {}
  const allowlists = collect?.flags ?? {}

  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || value === null) continue

    if (typeof value === 'boolean' || typeof value === 'number') {
      out[key] = value
      continue
    }

    if (typeof value === 'string') {
      const allowed = allowlists[key]
      if (allowed && allowed.includes(value)) {
        out[key] = value
      } else {
        out[key] = true
      }
      continue
    }

    // Arrays / objects (positional): presence only
    out[key] = true
  }

  return out
}

/**
 * Validate and merge custom fields from {@link telemetry.set}.
 * Undeclared strings are dropped (never thrown).
 */
export function sanitizeCustom(
  input: Record<string, unknown>,
  existing: Record<string, boolean | number | string>,
  collect?: CollectConfig,
): Record<string, boolean | number | string> {
  const out = { ...existing }
  const fieldAllowlists = collect?.fields ?? {}

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue

    if (typeof value === 'boolean' || typeof value === 'number') {
      out[key] = value
      continue
    }

    if (typeof value === 'string') {
      const allowed = fieldAllowlists[key]
      if (allowed && (allowed as readonly string[]).includes(value)) {
        out[key] = value
      }
      // undeclared strings: dropped silently
    }
  }

  return out
}
