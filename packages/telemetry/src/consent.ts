import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getTelemetryDir } from './paths'
import { TelemetryOutbox } from './outbox'

/**
 * Persisted telemetry consent state for a tool.
 * - `unset` — no explicit choice; default consent applies.
 * - `enabled` — user opted in via `telemetry enable`.
 * - `disabled` — user opted out via `telemetry disable`.
 */
export type TelemetryPreference = 'enabled' | 'disabled' | 'unset'

interface PreferenceFile {
  preference: TelemetryPreference
}

/** Resolve consent: `DO_NOT_TRACK` → `EVLOG_TELEMETRY` → persisted preference. */
export function resolveConsent(toolName: string): boolean {
  if (process.env.DO_NOT_TRACK === '1') return false
  if (process.env.EVLOG_TELEMETRY === '0') return false
  if (process.env.EVLOG_TELEMETRY === '1') return true

  const pref = readPreferenceSync(toolName)
  if (pref === 'disabled') return false
  if (pref === 'enabled') return true

  // Default: enabled (first-run notice handles disclosure)
  return true
}

/** Read persisted preference without throwing. */
export function readPreferenceSync(toolName: string): TelemetryPreference {
  try {
    const raw = readFileSync(join(getTelemetryDir(toolName), 'preference.json'), 'utf-8')
    const parsed = JSON.parse(raw) as PreferenceFile
    return parsed.preference ?? 'unset'
  } catch {
    return 'unset'
  }
}

/** Persist user telemetry preference. */
export async function writePreference(toolName: string, preference: TelemetryPreference): Promise<void> {
  const dir = getTelemetryDir(toolName)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'preference.json'), JSON.stringify({ preference }), 'utf-8')
}

/** Remove the outbox on opt-out (retroactive on undelivered data). */
export async function purgeOutbox(toolName: string): Promise<void> {
  await new TelemetryOutbox({ toolName }).purge()
}
