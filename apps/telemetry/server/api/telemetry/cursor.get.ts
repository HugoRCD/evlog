/**
 * `GET /api/telemetry/cursor` — protected. The dashboard's live-refresh probe:
 * a change token for the `runs` table that costs two indexed `max()` lookups,
 * so the UI can poll on a fast cadence and only refetch the expensive
 * stats/runs payloads once an event has actually landed.
 */
export default defineEventHandler(async (event): Promise<RunsCursor> => {
  await requireDashboardSession(event)

  return getRunsCursor()
})
