/**
 * Bundle size measurement script.
 *
 * Measures the size of every entry point in dist/ and outputs
 * a JSON report for tracking and comparison.
 *
 * Usage:
 *   bun bench/size.ts                    # print table
 *   bun bench/size.ts --json             # output JSON
 *   bun bench/size.ts --json > size.json # save to file
 */

import { gzipSync } from 'node:zlib'
import { Glob } from 'bun'

interface EntrySize {
  entry: string
  raw: number
  gzip: number
}

interface SizeReport {
  entries: EntrySize[]
  total: { raw: number, gzip: number }
}

const DIST_DIR = new URL('../../dist/', import.meta.url).pathname

const ENTRY_POINTS: Record<string, string> = {
  'core (index)': 'index.mjs',
  'logger': 'logger.mjs',
  'error': 'error.mjs',
  'utils': 'utils.mjs',
  'types': 'types.mjs',
  'enrichers': 'enrichers.mjs',
  'pipeline': 'pipeline.mjs',
  'http': 'http.mjs',
  'browser': 'browser.mjs',
  'toolkit': 'toolkit.mjs',
  'workers': 'workers.mjs',
  'client': 'client.mjs',
}

const ADAPTER_GLOB = 'adapters/*.mjs'
const FRAMEWORK_DIRS = ['hono', 'express', 'elysia', 'fastify', 'nestjs', 'sveltekit', 'next', 'nitro', 'vite', 'ai']

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(2)} kB`
}

async function measureFile(path: string): Promise<{ raw: number, gzip: number }> {
  const file = Bun.file(path)
  const content = await file.arrayBuffer()
  const raw = content.byteLength
  const gzip = gzipSync(new Uint8Array(content)).byteLength
  return { raw, gzip }
}

async function measureEntry(name: string, relativePath: string): Promise<EntrySize | null> {
  const fullPath = `${DIST_DIR}${relativePath}`
  const file = Bun.file(fullPath)
  if (!await file.exists()) return null

  const { raw, gzip } = await measureFile(fullPath)
  return { entry: name, raw, gzip }
}

async function collectAdapters(): Promise<EntrySize[]> {
  const entries: EntrySize[] = []
  const glob = new Glob(ADAPTER_GLOB)

  for await (const path of glob.scan({ cwd: DIST_DIR })) {
    const name = path.replace('adapters/', '').replace('.mjs', '')
    if (name.startsWith('_')) continue
    const result = await measureEntry(`adapter/${name}`, path)
    if (result) entries.push(result)
  }

  return entries
}

async function collectFrameworks(): Promise<EntrySize[]> {
  const entries: EntrySize[] = []

  for (const dir of FRAMEWORK_DIRS) {
    const glob = new Glob(`${dir}/**/*.mjs`)
    let totalRaw = 0
    let totalGzip = 0
    let found = false

    for await (const path of glob.scan({ cwd: DIST_DIR })) {
      if (path.includes('/_') || path.endsWith('.d.mts')) continue
      const { raw, gzip } = await measureFile(`${DIST_DIR}${path}`)
      totalRaw += raw
      totalGzip += gzip
      found = true
    }

    if (found) {
      entries.push({ entry: `framework/${dir}`, raw: totalRaw, gzip: totalGzip })
    }
  }

  return entries
}

async function run(): Promise<void> {
  const entries: EntrySize[] = []

  for (const [name, path] of Object.entries(ENTRY_POINTS)) {
    const result = await measureEntry(name, path)
    if (result) entries.push(result)
  }

  entries.push(...await collectAdapters())
  entries.push(...await collectFrameworks())

  entries.sort((a, b) => b.gzip - a.gzip)

  const total = entries.reduce(
    (acc, e) => ({ raw: acc.raw + e.raw, gzip: acc.gzip + e.gzip }),
    { raw: 0, gzip: 0 },
  )

  const report: SizeReport = { entries, total }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2))
    return
  }

  console.log('')
  console.log('  Bundle Size Report')
  console.log('  ==================')
  console.log('')
  console.log('  Entry                     Raw          Gzip')
  console.log('  ─────────────────────────────────────────────')

  for (const entry of entries) {
    const name = entry.entry.padEnd(24)
    const raw = formatBytes(entry.raw).padStart(10)
    const gzip = formatBytes(entry.gzip).padStart(10)
    console.log(`  ${name} ${raw}    ${gzip}`)
  }

  console.log('  ─────────────────────────────────────────────')
  console.log(`  ${'Total'.padEnd(24)} ${formatBytes(total.raw).padStart(10)}    ${formatBytes(total.gzip).padStart(10)}`)
  console.log('')
}

run()
