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
 * How long a "still empty" verdict stays cached. Short, so the dashboard
 * flips to real data within seconds of the very first ingest. The opposite
 * verdict ("has rows") is cached for the lifetime of the instance — the
 * table never goes back to empty in practice.
 */
const EMPTY_TABLE_TTL_MS = 10_000

let hasRealRuns = false
let emptyUntil = 0
/** De-dupes the existence check across the requests of a single poll cycle. */
let inFlight: Promise<boolean> | null = null

/** Test seam — drops the memoized verdict so each case starts from a clean slate. */
export function resetMockDataCache(): void {
  hasRealRuns = false
  emptyUntil = 0
  inFlight = null
}

async function resolveHasAnyRuns(): Promise<boolean> {
  try {
    const found = await hasAnyRuns()
    if (found) hasRealRuns = true
    else emptyUntil = Date.now() + EMPTY_TABLE_TTL_MS
    return found
  } catch (err) {
    log.warn({
      mockData: { fallback: true, reason: 'db unavailable' },
      error: { message: err instanceof Error ? err.message : String(err) },
    })
    emptyUntil = Date.now() + EMPTY_TABLE_TTL_MS
    return false
  } finally {
    inFlight = null
  }
}

/**
 * Mock mode serves generated sample data instead of querying the database —
 * active automatically whenever the `runs` table has no rows yet (a fresh
 * clone, a brand new deploy with nothing ingested), so the dashboard is
 * explorable and interactive with zero setup. Once real events land, real
 * data takes over on its own.
 *
 * The verdict is memoized per server instance: every stats/runs/cursor
 * request used to pay for its own `select id from runs limit 1` round trip,
 * which on a live dashboard meant several redundant queries per poll cycle.
 *
 * Also falls back to mock data if the existence check itself fails (e.g. a
 * misconfigured `DATABASE_URL`) so the dashboard never hard-fails to a blank
 * error page — override with `ANALYTICS_MOCK_DATA=0` to see the real error
 * instead.
 */
export async function shouldUseMockData(): Promise<boolean> {
  const override = mockDataOverride()
  if (override !== undefined) return override

  if (hasRealRuns) return false
  if (Date.now() < emptyUntil) return true

  inFlight ??= resolveHasAnyRuns()
  return !(await inFlight)
}
