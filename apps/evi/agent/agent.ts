import { defineAgent, defineDynamic } from 'eve'
import { gatewayRouting, sessionTags } from './lib/gateway'
import { MODEL } from './lib/model'

function selectModel(_event: unknown, ctx: { channel: { kind?: string } }) {
  return {
    model: MODEL,
    modelOptions: {
      providerOptions: {
        gateway: { ...gatewayRouting(ctx.channel.kind), tags: sessionTags(ctx.channel.kind) },
      },
    },
  }
}

export default defineAgent({
  // Also on turn.started: a session whose process died before the selection
  // committed resumes with none, and eve fails the turn rather than guess.
  model: defineDynamic({
    events: {
      'session.started': selectModel,
      'turn.started': selectModel,
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
