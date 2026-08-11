import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { PostHogTraceExporter } from '@posthog/ai/otel'
import { registerOTel } from '@vercel/otel'
import { defineInstrumentation } from 'eve/instrumentation'
import { evlogRuntimeContext } from 'evlog/eve'
import { environment } from './lib/environment'
import { createPostHogAttributeProcessor } from './lib/posthog-spans'

const projectToken = process.env.POSTHOG_API_KEY

export default defineInstrumentation({
  // Prompts, responses and tool payloads carry third-party GitHub and Linear
  // content and never leave the agent.
  recordInputs: false,
  recordOutputs: false,
  setup: ({ agentName }) => {
    // Registering a provider with no exporter would replace eve's own.
    if (!projectToken) return
    registerOTel({
      serviceName: agentName,
      spanProcessors: [
        createPostHogAttributeProcessor(),
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
      // Attributed to whoever opened the session, not to this turn's caller.
      const distinctId = input.session.auth.initiator?.principalId ?? caller?.principalId
      const evlog = evlogRuntimeContext(input)
      return {
        runtimeContext: {
          ...evlog,
          // PostHog keeps only `posthog_`-prefixed attributes, and strips the prefix.
          ...(evlog ? { posthog_evlog_request_id: evlog['evlog.request_id'] } : {}),
          ...(evlog ? { posthog_evlog_session_id: evlog['evlog.session_id'] } : {}),
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
