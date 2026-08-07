import { defineInstrumentation } from 'eve/instrumentation'
import { evlogRuntimeContext } from 'evlog/eve'

/**
 * OpenTelemetry spans for every turn, carrying evlog's correlation ids and the
 * calling principal. Register an exporter through `setup` to ship them.
 */
export default defineInstrumentation({
  events: {
    'step.started': (input) => {
      const caller = input.session.auth.current
      return {
        runtimeContext: {
          ...evlogRuntimeContext(input),
          // Omitted rather than blank: an empty attribute reads as an empty id.
          ...(caller ? { 'caller.principal_id': caller.principalId } : {}),
          ...(caller ? { 'caller.principal_type': caller.principalType } : {}),
        },
      }
    },
  },
})
