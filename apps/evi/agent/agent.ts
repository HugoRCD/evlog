import type { ModelMessage } from 'ai'
import type { SessionAuthContext } from 'eve/context'
import { defineAgent, defineDynamic } from 'eve'
import { gatewayRouting, sessionTags } from './lib/gateway'
import { modelForMessages, modelForStep } from './lib/model'
import { isScheduleAppAuth } from './lib/trust'

interface ModelContext {
  channel: { kind?: string }
  messages: readonly ModelMessage[]
  session: { auth: { current: SessionAuthContext | null } }
}

/**
 * Schedules deliver through the maintainer's channel, so `channel.kind` names
 * that channel and never `schedule`: the app principal on the turn is what
 * separates a scheduled run from a message the maintainer just sent.
 */
function modelOptions(ctx: ModelContext) {
  return {
    providerOptions: {
      gateway: {
        ...gatewayRouting(isScheduleAppAuth(ctx.session.auth.current)),
        tags: sessionTags(ctx.channel.kind),
      },
    },
  }
}

function selectModel(_event: unknown, ctx: ModelContext) {
  return { model: modelForMessages(ctx.messages), modelOptions: modelOptions(ctx) }
}

export default defineAgent({
  // Also on turn.started: a session whose process died before the selection
  // committed resumes with none, and eve fails the turn rather than guess.
  // `step.started` re-evaluates each model call: the vision model runs only
  // while the current turn carries image parts; afterwards the base model
  // returns with earlier turns' images stubbed out (it rejects them raw).
  model: defineDynamic({
    events: {
      'session.started': selectModel,
      'turn.started': selectModel,
      'step.started': (_event: unknown, ctx: ModelContext) => ({
        model: modelForStep(ctx.messages),
        modelOptions: modelOptions(ctx),
      }),
    },
  }),
  /** This model honors only `high` and `xhigh`. */
  reasoning: 'high',
  /** Bounds a runaway session, not cost: one real thread runs a few million in. */
  limits: {
    maxInputTokensPerSession: 20_000_000,
    maxOutputTokensPerSession: 250_000,
  },
})
