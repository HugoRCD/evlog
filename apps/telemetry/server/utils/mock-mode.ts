/**
 * Explicit override, read straight from the env — pure and DB-free so it's
 * cheap to unit test. `undefined` means "let `shouldUseMockData()` decide".
 */
export function mockDataOverride(): boolean | undefined {
  const flag = process.env.ANALYTICS_MOCK_DATA
  if (flag === '1' || flag === 'true') return true
  if (flag === '0' || flag === 'false') return false
  return undefined
}

/**
 * Mock mode serves generated sample data instead of querying the database —
 * active automatically whenever the `runs` table has no rows yet (a fresh
 * clone, a brand new deploy with nothing ingested), so the dashboard is
 * explorable and interactive with zero setup. Once real events land, real
 * data takes over on its own.
 *
 * Also falls back to mock data if the existence check itself fails (e.g. a
 * misconfigured `DATABASE_URL`) so the dashboard never hard-fails to a blank
 * error page — override with `ANALYTICS_MOCK_DATA=0` to see the real error
 * instead.
 */
export async function shouldUseMockData(): Promise<boolean> {
  const override = mockDataOverride()
  if (override !== undefined) return override

  try {
    return !(await hasAnyRuns())
  } catch (err) {
    log.warn({
      mockData: { fallback: true, reason: 'db unavailable' },
      error: { message: err instanceof Error ? err.message : String(err) },
    })
    return true
  }
}
