import type { ModelMessage } from 'ai'
import { defineAgent, defineDynamic } from 'eve'
import { gatewayRouting, sessionTags } from './lib/gateway'
import { modelForMessages, modelForStep } from './lib/model'

interface ModelContext { channel: { kind?: string }, messages: readonly ModelMessage[] }

function modelOptions(kind?: string) {
  return {
    providerOptions: {
      gateway: { ...gatewayRouting(), tags: sessionTags(kind) },
    },
  }
}

function selectModel(_event: unknown, ctx: ModelContext) {
  return { model: modelForMessages(ctx.messages), modelOptions: modelOptions(ctx.channel.kind) }
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
        modelOptions: modelOptions(ctx.channel.kind),
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
