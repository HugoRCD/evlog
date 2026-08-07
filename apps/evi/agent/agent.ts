import { defineAgent, defineDynamic } from 'eve'
import { gatewayRouting, sessionTags } from './lib/gateway'

// 1M context, tool use, and implicit caching at roughly a tenth of the cost
// per token. The 1M window matters here: docs__list-pages returns the whole
// page index on the first retrieval of a session.
const MODEL = 'deepseek/deepseek-v4-flash'

export default defineAgent({
  model: defineDynamic({
    fallback: MODEL,
    events: {
      // Always the same model, so prompt caching is untouched. The resolver
      // exists only to stamp the calling surface onto the gateway tags, which
      // is what makes a spend report separable by channel and by eval run.
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
  // This model only advertises "high" and "xhigh" as effort values
  // (GET /v1/models -> reasoning_options); "low" and "medium" are not levels it
  // honors, so setting them produced erratic, non-monotonic reasoning volume.
  reasoning: 'high',
  limits: {
    // The default is 40M input tokens and no output cap, which puts the ceiling
    // on a single runaway session near $8. A busy thread measures under 1.5M
    // input, so this leaves ~3x headroom for legitimate deep work while capping
    // a loop around $1.
    maxInputTokensPerSession: 5_000_000,
    maxOutputTokensPerSession: 100_000,
  },
  // Serves any call made before a session resolver runs, and any turn where the
  // resolver degraded.
  modelOptions: {
    providerOptions: { gateway: { ...gatewayRouting, tags: sessionTags() } },
  },
})
