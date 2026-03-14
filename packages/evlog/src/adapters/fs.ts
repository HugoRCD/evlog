import { appendFile, mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { WideEvent } from '../types'
import { defineDrain } from './_drain'

export interface FsConfig {
  /** Directory for log files */
  dir: string
  /** Max number of log files to keep (auto-deletes oldest when exceeded) */
  maxFiles?: number
  /** Max bytes per file before rotating to a new suffixed file */
  maxSizePerFile?: number
  /** Pretty-print JSON instead of compact NDJSON */
  pretty: boolean
}

const gitignoreWritten = new Set<string>()

async function ensureGitignore(dir: string): Promise<void> {
  const segments = dir.split('/')
  const evlogIndex = segments.findIndex(s => s === '.evlog')
  const targetDir = evlogIndex !== -1 ? segments.slice(0, evlogIndex + 1).join('/') : dir

  if (gitignoreWritten.has(targetDir)) return

  const gitignorePath = join(targetDir, '.gitignore')
  try {
    await stat(gitignorePath)
  }
  catch {
    await writeFile(gitignorePath, '*\n', 'utf-8')
  }
  gitignoreWritten.add(targetDir)
}

function getDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

async function resolveFilePath(dir: string, maxSizePerFile?: number): Promise<string> {
  const date = getDateString()
  const basePath = join(dir, `${date}.jsonl`)

  if (!maxSizePerFile) return basePath

  try {
    const stats = await stat(basePath)
    if (stats.size < maxSizePerFile) return basePath
  } catch {
    return basePath
  }

  for (let i = 1; i < 1000; i++) {
    const rotatedPath = join(dir, `${date}.${i}.jsonl`)
    try {
      const stats = await stat(rotatedPath)
      if (stats.size < maxSizePerFile) return rotatedPath
    } catch {
      return rotatedPath
    }
  }

  return join(dir, `${date}.999.jsonl`)
}

async function cleanupOldFiles(dir: string, maxFiles: number): Promise<void> {
  const files = await readdir(dir)
  const jsonlFiles = files.filter(f => f.endsWith('.jsonl')).sort()

  if (jsonlFiles.length <= maxFiles) return

  const toDelete = jsonlFiles.slice(0, jsonlFiles.length - maxFiles)
  await Promise.allSettled(toDelete.map(f => unlink(join(dir, f))))
}

export async function writeToFs(event: WideEvent, config: FsConfig): Promise<void> {
  await writeBatchToFs([event], config)
}

export async function writeBatchToFs(events: WideEvent[], config: FsConfig): Promise<void> {
  if (events.length === 0) return

  await mkdir(config.dir, { recursive: true })
  await ensureGitignore(config.dir)

  const filePath = await resolveFilePath(config.dir, config.maxSizePerFile)
  const lines = `${events
    .map(e => config.pretty ? JSON.stringify(e, null, 2) : JSON.stringify(e))
    .join('\n') }\n`

  await appendFile(filePath, lines, 'utf-8')

  if (config.maxFiles) {
    await cleanupOldFiles(config.dir, config.maxFiles)
  }
}

/**
 * Create a drain function that writes logs to the local file system as NDJSON.
 *
 * Files are organized by date (`2026-03-14.jsonl`) with optional size-based
 * rotation and automatic cleanup of old files.
 *
 * @example
 * ```ts
 * // Default: writes to .evlog/logs/
 * nitroApp.hooks.hook('evlog:drain', createFsDrain())
 *
 * // With options
 * nitroApp.hooks.hook('evlog:drain', createFsDrain({
 *   dir: '.evlog/logs',
 *   maxFiles: 7,
 *   pretty: true,
 * }))
 * ```
 */
export function createFsDrain(overrides?: Partial<FsConfig>) {
  return defineDrain<FsConfig>({
    name: 'fs',
    resolve: () => ({
      dir: overrides?.dir ?? '.evlog/logs',
      pretty: overrides?.pretty ?? false,
      maxFiles: overrides?.maxFiles,
      maxSizePerFile: overrides?.maxSizePerFile,
    }),
    send: writeBatchToFs,
  })
}
