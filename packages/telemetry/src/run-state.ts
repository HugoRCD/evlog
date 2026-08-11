import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveConsent } from './consent'
import { isEphemeralCI } from './enrich'
import { getTelemetryDir } from './paths'

/** One command's persisted run counter within a single machine's data dir. */
interface CommandRunState {
  ordinal: number
  lastScore: number
}

/** Per-command state in the shared `run-state.json`. */
type RunStateFile = Record<string, CommandRunState>

const STATE_FILE = 'run-state.json'

/** What {@link advanceRunState} reports for one run. */
export interface RunState {
  /** Monotonic count of runs for this command on this machine (1-based). */
  ordinal: number
  /** Signed score change against the previous run; absent on the first run. */
  delta?: number
}

/** Read the whole state file, tolerating a missing or corrupt file. */
async function readStateFile(path: string): Promise<RunStateFile | undefined> {
  let raw: string
  try {
    raw = await readFile(path, 'utf-8')
  } catch {
    return undefined
  }
  try {
    const parsed = JSON.parse(raw) as Partial<RunStateFile>
    const out: RunStateFile = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (value && typeof value.ordinal === 'number' && typeof value.lastScore === 'number') {
        out[key] = { ordinal: value.ordinal, lastScore: value.lastScore }
      }
    }
    return out
  } catch {
    return undefined
  }
}

/**
 * Advance a monotonic, per-command run counter for one tool and return the new
 * ordinal plus the signed score delta against the previous run.
 *
 * The counter lives in the tool's telemetry data directory, keyed by command
 * name only: nothing about the project, the git remote or the path is hashed
 * into it, so it is a per-machine sequence rather than a per-project one. It is
 * not advanced at all when telemetry is off, or in ephemeral CI where the
 * machine id is already omitted and a cross-run trajectory is meaningless.
 *
 * Returns `undefined` without writing when consent is revoked or the run has no
 * stable machine identity, so callers can omit both fields from the payload.
 * Never throws.
 */
export async function advanceRunState(
  toolName: string,
  command: string,
  score: number,
): Promise<RunState | undefined> {
  if (!resolveConsent(toolName) || isEphemeralCI()) return undefined

  const dir = getTelemetryDir(toolName)
  const statePath = join(dir, STATE_FILE)

  try {
    const file = await readStateFile(statePath)
    const previous = file?.[command]
    const ordinal = (previous?.ordinal ?? 0) + 1
    const delta = previous ? score - previous.lastScore : undefined
    await mkdir(dir, { recursive: true })
    await writeFile(statePath, JSON.stringify({ ...file, [command]: { ordinal, lastScore: score } }), 'utf-8')
    return delta === undefined ? { ordinal } : { ordinal, delta }
  } catch {
    /* Telemetry must never break the command it reports on. */
    return undefined
  }
}

/** Delete the run counter state (e.g. on opt-out, so it resets). */
export async function purgeRunState(toolName: string): Promise<void> {
  try {
    await unlink(join(getTelemetryDir(toolName), STATE_FILE))
  } catch {
    // absent is fine
  }
}
