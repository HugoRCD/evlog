import type { ModelMessage } from 'ai'
import { defineAgent, defineDynamic } from 'eve'
import { gatewayRouting, sessionTags } from './lib/gateway'
import { modelForMessages } from './lib/model'

function selectModel(_event: unknown, ctx: { channel: { kind?: string }, messages: readonly ModelMessage[] }) {
  return {
    model: modelForMessages(ctx.messages),
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
  // `step.started` re-evaluates each model call: the session runs the vision
  // model while image parts sit in history (the base model rejects them) and
  // returns to the base model once compaction drops the payloads.
  model: defineDynamic({
    events: {
      'session.started': selectModel,
      'turn.started': selectModel,
      'step.started': selectModel,
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
