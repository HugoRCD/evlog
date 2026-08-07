import { defineAgent, defineDynamic } from 'eve'
import { gatewayRouting, sessionTags } from './lib/gateway'

const MODEL = 'deepseek/deepseek-v4-flash'

export default defineAgent({
  model: defineDynamic({
    fallback: MODEL,
    // Same model every time, so prompt caching is untouched. The resolver only
    // stamps the calling surface onto the gateway tags.
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
  /** This model only advertises `high` and `xhigh`; lower values are not honored. */
  reasoning: 'high',
  /** Defaults are 40M input and no output cap, near $8 for one runaway session. */
  limits: {
    maxInputTokensPerSession: 5_000_000,
    maxOutputTokensPerSession: 100_000,
  },
  /** Serves calls made before the session resolver runs, or when it degraded. */
  modelOptions: {
    providerOptions: { gateway: { ...gatewayRouting, tags: sessionTags() } },
  },
})
