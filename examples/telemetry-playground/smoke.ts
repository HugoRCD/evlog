#!/usr/bin/env tsx
/**
 * Smoke script for createTelemetry() (non-citty path).
 *
 * Usage:
 *   pnpm run smoke
 *   EVLOG_TELEMETRY_DEBUG=1 pnpm run smoke
 *   XDG_CONFIG_HOME=/tmp/evlog-smoke pnpm run smoke
 */
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createTelemetry, generateDisclosure, telemetry } from '@evlog/telemetry'

const TOOL = 'evlog-telemetry-playground'

function outboxPath(): string {
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
  return join(base, TOOL, 'telemetry', 'outbox.ndjson')
}

async function main() {
  const t = createTelemetry({ name: TOOL, version: '0.0.0' })

  await t.run('smoke', async () => {
    telemetry.set({ step: 1, ok: true })
  })

  await t.flush()

  const outbox = outboxPath()
  let lines = 0
  try {
    const raw = await readFile(outbox, 'utf-8')
    lines = raw.trim().split('\n').filter(Boolean).length
  } catch {
    // opt-out or first run
  }

  process.stderr.write(`\n[telemetry:smoke] outbox: ${outbox}\n`)
  process.stderr.write(`[telemetry:smoke] buffered events: ${lines}\n`)
  process.stderr.write(`[telemetry:smoke] disclosure lines: ${generateDisclosure(TOOL).markdown.split('\n').length}\n`)
  process.stderr.write('[telemetry:smoke] done — use EVLOG_TELEMETRY_DEBUG=1 to print payloads\n')
}

await main()
