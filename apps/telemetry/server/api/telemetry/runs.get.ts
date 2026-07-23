/** `GET /api/telemetry/runs` — protected. Sorted, paginated raw events for the data browser. */
export default defineEventHandler(async (event): Promise<RunsResponse> => {
  await requireDashboardSession(event)
  const log = useLogger(event)

  const query = getQuery(event)
  const filter = parseRunsFilter(query)
  const sort = parseSort(query.sort)
  const order = parseOrder(query.order)
  const pageSize = clampLimit(query.pageSize)
  const page = parsePage(query.page)

  log.set({ query: { ...filter, sort, order, page, pageSize } })

  return getRunsPageForFilter(filter, { sort, order, page, pageSize })
})
