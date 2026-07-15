import { appendFile, mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { RunEvent } from './types'
import { getTelemetryDir } from './paths'

export interface OutboxOptions {
  toolName: string
  maxBufferBytes?: number
  maxEventAgeMs?: number
}

interface StoredEvent {
  event: RunEvent
  storedAt: number
}

const DEFAULT_MAX_BYTES = 1024 * 1024
const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

/** Disk-buffered NDJSON outbox — append-only writes, lockfile on compaction. */
export class TelemetryOutbox {
  private readonly dir: string
  private readonly outboxPath: string
  private readonly lockPath: string
  private readonly maxBytes: number
  private readonly maxAgeMs: number

  constructor(opts: OutboxOptions) {
    this.dir = getTelemetryDir(opts.toolName)
    this.outboxPath = join(this.dir, 'outbox.ndjson')
    this.lockPath = join(this.dir, 'outbox.lock')
    this.maxBytes = opts.maxBufferBytes ?? DEFAULT_MAX_BYTES
    this.maxAgeMs = opts.maxEventAgeMs ?? DEFAULT_MAX_AGE_MS
  }

  /** Append one event before any network attempt. Never throws. */
  async append(event: RunEvent): Promise<void> {
    try {
      await mkdir(this.dir, { recursive: true })
      const line = `${JSON.stringify({ event, storedAt: Date.now() } satisfies StoredEvent) }\n`
      await appendFile(this.outboxPath, line, 'utf-8')
      await this.enforceBounds()
    } catch {
      // never harm the host
    }
  }

  /** Read all valid events in order. Corrupt lines skipped. */
  async readAll(): Promise<RunEvent[]> {
    let raw: string
    try {
      raw = await readFile(this.outboxPath, 'utf-8')
    } catch {
      return []
    }

    const events: RunEvent[] = []
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue
      try {
        const stored = JSON.parse(line) as StoredEvent
        if (stored?.event?.event === 'run') events.push(stored.event)
      } catch {
        // skip corrupt
      }
    }
    return events
  }

  /** Remove delivered events by rewriting the outbox. */
  async removeDelivered(keys: Set<string>): Promise<void> {
    if (keys.size === 0) return
    try {
      await this.withLock(async () => {
        const remaining: StoredEvent[] = []
        let raw: string
        try {
          raw = await readFile(this.outboxPath, 'utf-8')
        } catch {
          return
        }

        const now = Date.now()
        for (const line of raw.split('\n')) {
          if (!line.trim()) continue
          try {
            const stored = JSON.parse(line) as StoredEvent
            if (!stored?.event?.idempotencyKey) continue
            if (keys.has(stored.event.idempotencyKey)) continue
            if (now - stored.storedAt > this.maxAgeMs) continue
            remaining.push(stored)
          } catch {
            // skip
          }
        }

        const tmp = `${this.outboxPath}.tmp`
        const body = remaining.map(s => `${JSON.stringify(s) }\n`).join('')
        await writeFile(tmp, body, 'utf-8')
        await rename(tmp, this.outboxPath)
      })
    } catch {
      // silent
    }
  }

  /** Delete the outbox file entirely. */
  async purge(): Promise<void> {
    try {
      await unlink(this.outboxPath)
    } catch {
      // absent is fine
    }
  }

  private async enforceBounds(): Promise<void> {
    try {
      const fileStat = await stat(this.outboxPath)
      if (fileStat.size <= this.maxBytes) return
      await this.compactByAge()
    } catch {
      // silent
    }
  }

  private async compactByAge(): Promise<void> {
    await this.withLock(async () => {
      const now = Date.now()
      let raw: string
      try {
        raw = await readFile(this.outboxPath, 'utf-8')
      } catch {
        return
      }

      const kept: StoredEvent[] = []
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue
        try {
          const stored = JSON.parse(line) as StoredEvent
          if (now - stored.storedAt <= this.maxAgeMs) kept.push(stored)
        } catch {
          // skip
        }
      }

      // oldest-first drop when still over budget
      while (kept.length > 0) {
        const body = kept.map(s => `${JSON.stringify(s) }\n`).join('')
        if (Buffer.byteLength(body, 'utf-8') <= this.maxBytes) break
        kept.shift()
      }

      const tmp = `${this.outboxPath}.tmp`
      await writeFile(tmp, kept.map(s => `${JSON.stringify(s) }\n`).join(''), 'utf-8')
      await rename(tmp, this.outboxPath)
    })
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await mkdir(this.dir, { recursive: true })
    let handle
    let acquired = false
    try {
      handle = await open(this.lockPath, 'wx')
      acquired = true
      return await fn()
    } finally {
      if (acquired) {
        await handle?.close().catch(() => {})
        await unlink(this.lockPath).catch(() => {})
      }
    }
  }
}
