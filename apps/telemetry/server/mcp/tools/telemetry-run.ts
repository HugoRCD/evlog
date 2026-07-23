import { z } from 'zod'

/**
 * Mirrors `GET /api/telemetry/runs/:id` — see `getRunDetailById()` in
 * `server/utils/telemetry-queries.ts`.
 */
export default defineMcpTool({
  description: 'Get the full detail of a single evlog CLI telemetry run by its numeric id — includes flags, custom fields, environment info (node version, CI provider, TTY, agent), and the idempotency key, on top of what the runs list already shows.',
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: {
    id: z.number().int().positive().describe('Numeric id of the run, as shown in the dashboard\'s raw events browser.'),
  },
  inputExamples: [{ id: 42 }],
  handler: async ({ id }) => {
    const run = await getRunDetailById(id)
    if (!run) throw telemetryErrors.RUN_NOT_FOUND({ id })
    return run
  },
})
