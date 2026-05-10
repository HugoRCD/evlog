import type { Reporter, TestModule } from 'vitest/node'

const SLOW_TEST_BUDGET_MS = Number(process.env.EVLOG_SLOW_TEST_BUDGET_MS ?? 500)

interface SlowEntry {
  fullName: string
  durationMs: number
  filepath: string
}

/**
 * Vitest reporter that surfaces tests slower than {@link SLOW_TEST_BUDGET_MS}.
 * Loaded only on CI (see `vitest.config.ts`) — local runs stay quiet.
 *
 * Override via `EVLOG_SLOW_TEST_BUDGET_MS=300 pnpm run test`.
 *
 * Does not fail the run; the goal is to surface a baseline so we can tighten
 * the budget over time.
 */
export default class SlowReporter implements Reporter {
  private slow: SlowEntry[] = []

  onTestModuleEnd(module: TestModule): void {
    for (const test of module.children.allTests()) {
      const result = test.result()
      const durationMs = test.diagnostic()?.duration ?? 0
      if (result.state !== 'passed' && result.state !== 'failed') continue
      if (durationMs > SLOW_TEST_BUDGET_MS) {
        this.slow.push({
          fullName: test.fullName,
          durationMs,
          filepath: module.moduleId,
        })
      }
    }
  }

  onTestRunEnd(): void {
    if (this.slow.length === 0) return
    this.slow.sort((a, b) => b.durationMs - a.durationMs)
    const top = this.slow.slice(0, 20)
    console.warn(
      `\n[evlog] ${this.slow.length} test(s) slower than ${SLOW_TEST_BUDGET_MS}ms (top 20):`,
    )
    for (const entry of top) {
      console.warn(`  ${entry.durationMs.toFixed(0).padStart(5)}ms  ${entry.fullName}`)
      console.warn(`         ${entry.filepath}`)
    }
  }
}
