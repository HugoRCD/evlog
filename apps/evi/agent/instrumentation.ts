import { defineInstrumentation } from 'eve/instrumentation'
import { evlogRuntimeContext } from 'evlog/eve'

/**
 * Enables eve's OpenTelemetry surface and joins it to the evlog wide events.
 *
 * Uses eve's own `defineInstrumentation` rather than `defineEvlogInstrumentation`,
 * which owns the whole file: this slot is also where a PostHog or Sentry exporter
 * would land. Register one through `setup` — without it eve keeps traces local.
 */
export default defineInstrumentation({
  events: {
    'step.started': (input) => {
      const caller = input.session.auth.current
      return {
        runtimeContext: {
          ...evlogRuntimeContext(input),
          // Omitted rather than blank when unauthenticated: an empty attribute
          // reads as a caller whose id happens to be empty.
          ...(caller ? { 'caller.principal_id': caller.principalId } : {}),
          ...(caller ? { 'caller.principal_type': caller.principalType } : {}),
        },
      }
    },
  },
})
