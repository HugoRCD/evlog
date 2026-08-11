import { defineDynamic, defineTool } from 'eve/tools'
import { z } from 'zod'
import { channelName } from '../lib/channel'
import { NO_DB_ERROR, saveFeedback } from '../lib/feedback'
import { isAutonomous } from '../lib/trust'

// Feedback capture is a small, user-requested write: it stays off the approval
// cards. Autonomous first-responder turns never see the tool (they process
// untrusted text and have no one to confirm with). Keep executes inline in the
// resolver (docs/notes.md).
export default defineDynamic({
  events: {
    'turn.started': (_event, ctx) => {
      if (isAutonomous(ctx.session.auth.current)) return null
      const channel = channelName(ctx.channel.kind)
      const sessionRef = ctx.session.id
      return {
        feedback__record: defineTool({
          description:
            'Record written feedback about an Evi answer on behalf of the person in this conversation. Call it only when that person explicitly gives feedback (for example "this answer was wrong because X" or "that was really helpful"), never to record your own judgement. The entry is stored in the feedback store and feeds the weekly self-review and evals. Capture their reason as text when they give one.',
          inputSchema: z.object({
            verdict: z.enum(['positive', 'negative']).describe('Whether the feedback is positive or negative.'),
            text: z.string().min(1).describe('What the person said about the answer, in their words, including the reason.'),
            messageRef: z.string().optional().describe('Optional platform identifier of the specific message or comment being rated.'),
          }),
          async execute(input, toolCtx) {
            if (isAutonomous(toolCtx.session.auth.current)) {
              return { success: false as const, error: 'Feedback capture is not available in this session.' }
            }
            const author = toolCtx.session.auth.current?.principalId ?? 'unknown'
            const result = await saveFeedback({
              channel,
              verdict: input.verdict,
              author,
              text: input.text,
              messageRef: input.messageRef,
              sessionRef,
              source: 'written',
            })
            if (!result.success && result.error === NO_DB_ERROR) {
              return { success: false as const, error: NO_DB_ERROR }
            }
            return result
          },
        }),
      }
    },
  },
})
