import { defineTool } from 'eve/tools'
import { never } from 'eve/tools/approval'
import { useLogger } from 'evlog/eve'
import { z } from 'zod'

/**
 * Lets the agent write business context onto the wide event for the turn it is
 * running in — the order it looked up, the decision it made, the amount it
 * refunded. Those fields are what turn a trace into something you can query.
 *
 * Approval is `never()`: the write is in-process and has no external effect.
 */
export default defineTool({
  description:
    'Record a business fact about the current turn on its observability event. '
    + 'Use it for identifiers, decisions and amounts that would make this turn '
    + 'findable later. Never record user message content or personal data.',
  inputSchema: z.object({
    key: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/, 'lowercase identifier, e.g. order or customer')
      .describe('Field name to set on the event, e.g. "order".'),
    value: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .describe('Flat object of facts, e.g. { "id": "4821", "amount": 89 }.'),
  }),
  approval: never(),
  execute({ key, value }, ctx) {
    useLogger(ctx).set({ [key]: value })
    return { recorded: key }
  },
})
