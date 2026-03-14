/**
 * Benchmark comparison script.
 *
 * Compares two vitest bench JSON outputs and generates a markdown report
 * showing regressions, improvements, and unchanged benchmarks.
 *
 * Usage:
 *   bun bench/compare.ts <baseline.json> <current.json>
 *
 * The script exits with code 1 if any benchmark regressed by more than
 * the configured threshold (default: 10%).
 */

interface BenchmarkEntry {
  name: string
  hz: number
  mean: number
  p99: number
  rme: number
  sampleCount: number
}

interface BenchGroup {
  fullName: string
  benchmarks: BenchmarkEntry[]
}

interface BenchFile {
  filepath: string
  groups: BenchGroup[]
}

interface BenchReport {
  files: BenchFile[]
}

const REGRESSION_THRESHOLD = 10 // percent

async function loadReport(path: string): Promise<BenchReport> {
  const raw = await Bun.file(path).text()
  return JSON.parse(raw) as BenchReport
}

function flattenBenchmarks(report: BenchReport): Map<string, BenchmarkEntry> {
  const map = new Map<string, BenchmarkEntry>()
  for (const file of report.files) {
    for (const group of file.groups) {
      for (const bench of group.benchmarks) {
        const key = `${group.fullName} > ${bench.name}`
        map.set(key, bench)
      }
    }
  }
  return map
}

function formatHz(hz: number): string {
  if (hz >= 1_000_000) return `${(hz / 1_000_000).toFixed(2)}M`
  if (hz >= 1_000) return `${(hz / 1_000).toFixed(1)}K`
  return hz.toFixed(0)
}

function formatDelta(delta: number): string {
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toFixed(1)}%`
}

function getIndicator(delta: number): string {
  if (delta <= -REGRESSION_THRESHOLD) return '🔴'
  if (delta <= -3) return '🟡'
  if (delta >= REGRESSION_THRESHOLD) return '🟢'
  if (delta >= 3) return '🟢'
  return '⚪'
}

async function compare(baselinePath: string, currentPath: string): Promise<string> {
  const baseline = await loadReport(baselinePath)
  const current = await loadReport(currentPath)

  const baseMap = flattenBenchmarks(baseline)
  const currMap = flattenBenchmarks(current)

  const rows: Array<{
    name: string
    baseHz: number
    currHz: number
    delta: number
    indicator: string
    p99Base: number
    p99Curr: number
  }> = []

  let hasRegression = false

  for (const [key, curr] of currMap) {
    const base = baseMap.get(key)
    if (!base) continue

    const delta = ((curr.hz - base.hz) / base.hz) * 100
    const indicator = getIndicator(delta)

    if (delta <= -REGRESSION_THRESHOLD) hasRegression = true

    rows.push({
      name: key,
      baseHz: base.hz,
      currHz: curr.hz,
      delta,
      indicator,
      p99Base: base.p99,
      p99Curr: curr.p99,
    })
  }

  rows.sort((a, b) => a.delta - b.delta)

  const lines: string[] = []

  lines.push('## Benchmark comparison')
  lines.push('')
  lines.push(`> Threshold: **${REGRESSION_THRESHOLD}%** · 🔴 regression · 🟡 warning · 🟢 improvement · ⚪ unchanged`)
  lines.push('')
  lines.push('| Status | Benchmark | Base (ops/sec) | Current (ops/sec) | Change | p99 base | p99 current |')
  lines.push('|--------|-----------|---------------:|------------------:|-------:|---------:|------------:|')

  for (const row of rows) {
    const shortName = row.name.replace(/^bench\/[^>]+> /, '')
    lines.push(
      `| ${row.indicator} | ${shortName} | ${formatHz(row.baseHz)} | ${formatHz(row.currHz)} | ${formatDelta(row.delta)} | ${row.p99Base.toFixed(4)}ms | ${row.p99Curr.toFixed(4)}ms |`,
    )
  }

  lines.push('')

  const regressions = rows.filter(r => r.delta <= -REGRESSION_THRESHOLD)
  const improvements = rows.filter(r => r.delta >= REGRESSION_THRESHOLD)
  const warnings = rows.filter(r => r.delta <= -3 && r.delta > -REGRESSION_THRESHOLD)

  lines.push('<details>')
  lines.push('<summary>Summary</summary>')
  lines.push('')
  lines.push(`- **${regressions.length}** regressions (>${REGRESSION_THRESHOLD}% slower)`)
  lines.push(`- **${warnings.length}** warnings (3-${REGRESSION_THRESHOLD}% slower)`)
  lines.push(`- **${improvements.length}** improvements (>${REGRESSION_THRESHOLD}% faster)`)
  lines.push(`- **${rows.length - regressions.length - improvements.length - warnings.length}** unchanged`)
  lines.push('')
  lines.push('</details>')

  if (hasRegression) {
    lines.push('')
    lines.push(`> [!WARNING]`)
    lines.push(`> Performance regressions detected (>${REGRESSION_THRESHOLD}% slower). Review before merging.`)
  }

  return lines.join('\n')
}

const [baselinePath, currentPath] = process.argv.slice(2)

if (!baselinePath || !currentPath) {
  console.error('Usage: bun bench/compare.ts <baseline.json> <current.json>')
  process.exit(1)
}

const markdown = await compare(baselinePath, currentPath)
console.log(markdown)

const hasRegression = markdown.includes('> [!WARNING]')
if (hasRegression) process.exit(1)
