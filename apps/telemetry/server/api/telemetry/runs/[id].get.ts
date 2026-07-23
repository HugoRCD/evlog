import { z } from 'zod'

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/** `GET /api/telemetry/runs/:id` — protected. Full record for one run, including flags/custom/env. */
export default defineEventHandler(async (event): Promise<RunDetail> => {
  await requireDashboardSession(event)
  const log = useLogger(event)

  const { id } = await getValidatedRouterParams(event, params => paramsSchema.parse(params))
  log.set({ query: { runId: id } })

  const run = await getRunDetailById(id)
  if (!run) throw telemetryErrors.RUN_NOT_FOUND({ id })
  return run
})
