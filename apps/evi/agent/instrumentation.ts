import { defineInstrumentation } from 'eve/instrumentation'
import { evlogRuntimeContext } from 'evlog/eve'

/**
 * Enables eve's OpenTelemetry surface and joins it to the evlog wide events.
 *
 * Without this file there is no span tree at all: eve's Agent Runs tab is fed by
 * Workflow run tags, which are a separate system. With it, each turn produces
 * `ai.eve.turn` -> `ai.streamText` per step -> `ai.streamText.doStream` and
 * `ai.toolCall` per tool, which is the only place per-tool timing and per-step
 * model input are visible. The wide event says a turn called six tools; the span
 * tree says which step each one ran in and what the model saw first.
 *
 * Written against eve's own `defineInstrumentation` rather than
 * `defineEvlogInstrumentation`, which owns the whole file: this one slot is also
 * where a PostHog or Sentry exporter would land, and `evlogRuntimeContext`
 * contributes evlog's correlation ids without claiming it.
 *
 * No `setup` on purpose: without an exporter eve keeps writing traces locally,
 * which is what we want until a backend is chosen. Register one here — the
 * callback receives the resolved agent name — and the same tree ships to it.
 * `recordInputs` / `recordOutputs` stay at eve's `true`: Evi reads public
 * repository content, and the model input on the span is what makes a
 * prompt-injection attempt reconstructable after the fact.
 */
export default defineInstrumentation({
  events: {
    // `evlog.request_id` / `evlog.session_id` resolve a span to its wide event.
    // The caller is on that event already, but a trace is where you land first
    // when a turn misbehaves, so it goes here too rather than costing a join.
    'step.started': input => ({
      runtimeContext: {
        ...evlogRuntimeContext(input),
        'caller.principal_id': input.session.auth.current?.principalId ?? '',
        'caller.principal_type': input.session.auth.current?.principalType ?? '',
      },
    }),
  },
})
