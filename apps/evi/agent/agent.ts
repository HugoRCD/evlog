import { defineAgent, defineDynamic } from 'eve'
import { gatewayRouting, sessionTags } from './lib/gateway'

const MODEL = 'deepseek/deepseek-v4-flash'

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
  limits: {
    maxInputTokensPerSession: 5_000_000,
    maxOutputTokensPerSession: 100_000,
  },
  modelOptions: {
    providerOptions: { gateway: { ...gatewayRouting, tags: sessionTags() } },
  },
})
