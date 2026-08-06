import { defineEvlogInstrumentation } from 'evlog/eve'

/**
 * Stamps `evlog.request_id` onto eve's AI SDK spans so a trace joins back to
 * the wide event for the same turn.
 *
 * No `setup` here: eve keeps writing its local traces, readable with
 * `eve traces` or `/traces` in the dev TUI. Add one to export elsewhere:
 *
 * ```ts
 * setup: ({ agentName }) => registerOTel({ serviceName: agentName })
 * ```
 */
export default defineEvlogInstrumentation()
