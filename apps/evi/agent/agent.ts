import { defineAgent, defineDynamic } from 'eve'
import { gatewayRouting, sessionTags } from './lib/gateway'

/** `EVI_MODEL` overrides the model, for running the eval suite on a candidate. */
const MODEL = process.env.EVI_MODEL || 'deepseek/deepseek-v4-flash'

export default defineAgent({
  model: defineDynamic({
    fallback: MODEL,
    events: {
      'session.started': (_event, ctx) => ({
        model: MODEL,
        modelOptions: {
          providerOptions: {
            gateway: { ...gatewayRouting, tags: sessionTags(ctx.channel.kind) },
          },
        },
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
  modelOptions: {
    providerOptions: { gateway: { ...gatewayRouting, tags: sessionTags() } },
  },
})
