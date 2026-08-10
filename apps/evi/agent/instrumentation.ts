import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { PostHogTraceExporter } from '@posthog/ai/otel'
import { registerOTel } from '@vercel/otel'
import { defineInstrumentation } from 'eve/instrumentation'
import { evlogRuntimeContext } from 'evlog/eve'
import { environment } from './lib/environment'

/**
 * OpenTelemetry spans for every turn, carrying evlog's correlation ids and the
 * calling principal. PostHog turns the model-call spans into AI Observability
 * generations; without a project key the provider still runs and eve keeps its
 * local traces.
 */
const projectToken = process.env.POSTHOG_API_KEY

export default defineInstrumentation({
  // Metadata only — prompts, responses and tool payloads carry third-party
  // GitHub and Linear content that has no reason to leave the agent.
  recordInputs: false,
  recordOutputs: false,
  setup: ({ agentName }) => {
    // Registering a provider with no exporter would replace the one eve set up
    // for its local traces, so a keyless environment is left alone entirely.
    if (!projectToken) return
    registerOTel({
      serviceName: agentName,
      spanProcessors: [
        new SimpleSpanProcessor(new PostHogTraceExporter({
          projectToken,
          ...(process.env.POSTHOG_HOST ? { host: process.env.POSTHOG_HOST } : {}),
        })),
      ],
    })
  },
  events: {
    'step.started': (input) => {
      const caller = input.session.auth.current
      // The principal that opened the session owns the run, even when a later
      // turn comes from someone else — that is who PostHog should attribute to.
      const distinctId = input.session.auth.initiator?.principalId ?? caller?.principalId
      return {
        runtimeContext: {
          ...evlogRuntimeContext(input),
          posthog_environment: environment(),
          // Omitted rather than blank: an empty attribute reads as an empty id.
          ...(distinctId ? { posthog_distinct_id: distinctId } : {}),
          ...(caller ? { 'caller.principal_id': caller.principalId } : {}),
          ...(caller ? { 'caller.principal_type': caller.principalType } : {}),
        },
      }
    },
  },
})
