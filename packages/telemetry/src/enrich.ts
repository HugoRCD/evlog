import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { agent, hasTTY, isCI, nodeVersion, provider } from 'std-env'
import type { EnvInfo } from './types'
import { getTelemetryDir } from './paths'

export type ResolveEnvironmentOptions = {
  /** Process env (defaults to `process.env`). */
  env?: NodeJS.Dict<string>
  /** Author override (e.g. packaged CLI → `production`). */
  override?: string
}

/**
 * Deploy / runtime stage for a telemetry run.
 *
 * Priority: `EVLOG_TELEMETRY_ENV` → `VERCEL_ENV` → tool `override` → `NODE_ENV` → `development`.
 */
export function resolveEnvironment(options: ResolveEnvironmentOptions = {}): string {
  const env = options.env ?? process.env
  const explicit = env.EVLOG_TELEMETRY_ENV?.trim()
  if (explicit) return explicit
  const vercel = env.VERCEL_ENV?.trim()
  if (vercel) return vercel
  if (options.override?.trim()) return options.override.trim()
  const nodeEnv = env.NODE_ENV?.trim()
  if (nodeEnv) return nodeEnv
  return 'development'
}

/** Build the standard `env` block from std-env (+ deploy stage). */
export function buildEnvInfo(options: { environment?: string } = {}): EnvInfo {
  return {
    node: nodeVersion ?? process.version.replace(/^v/, ''),
    ci: isCI,
    provider: provider ?? null,
    tty: hasTTY,
    agent: agent ?? null,
    environment: resolveEnvironment({ override: options.environment }),
  }
}

/**
 * Ephemeral CI environments skip machine id (no stable cross-run identity).
 */
function isEphemeralCI(): boolean {
  return isCI && !process.env.EVLOG_TELEMETRY_MACHINE_ID
}

/**
 * Anonymous hashed machine id, persisted in the user config dir.
 * Skipped in ephemeral CI.
 */
export async function resolveMachineId(toolName: string): Promise<string | undefined> {
  if (isEphemeralCI()) return undefined

  const dir = getTelemetryDir(toolName)
  const idPath = join(dir, 'machine-id')

  try {
    const existing = await readFile(idPath, 'utf-8')
    if (existing.trim()) {
      return hashMachineId(existing.trim())
    }
  } catch {
    // generate below
  }

  const raw = randomUUID()
  await mkdir(dir, { recursive: true })
  await writeFile(idPath, raw, 'utf-8')
  return hashMachineId(raw)
}

function hashMachineId(raw: string): string {
  return createHash('sha256').update(raw).digest('hex').slice(0, 16)
}
