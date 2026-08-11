import { trace, type Attributes, type Context } from '@opentelemetry/api'
import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-base'

/** PostHog keeps only `posthog_`-prefixed span attributes. */
const POSTHOG_PREFIX = 'posthog_'

function carried(attributes: Attributes | undefined): Attributes {
  const kept: Attributes = {}
  for (const [key, value] of Object.entries(attributes ?? {})) {
    if (key.startsWith(POSTHOG_PREFIX) && value !== undefined) kept[key] = value
  }
  return kept
}

/**
 * Carry a turn's `posthog_*` attributes down its span tree. eve applies the
 * `step.started` runtime context to the step span alone, so generation spans
 * would otherwise reach PostHog with no environment and no identity.
 */
export function createPostHogAttributeProcessor(): SpanProcessor {
  const live = new Map<string, Span>()

  return {
    onStart(span: Span, parentContext: Context) {
      const parentSpanId = trace.getSpanContext(parentContext)?.spanId
      const parent = parentSpanId ? live.get(parentSpanId) : undefined

      // Read the parent now rather than when it started: eve applies the
      // `step.started` runtime context after opening the span, so a snapshot
      // taken at its own `onStart` is empty and nothing below it inherits.
      const merged = { ...carried(parent?.attributes), ...carried(span.attributes) }
      if (Object.keys(merged).length > 0) span.setAttributes(merged)

      // Registered whatever it carries: a span with no attributes of its own
      // is still the parent that later spans resolve through.
      live.set(span.spanContext().spanId, span)
    },
    onEnd(span: ReadableSpan) {
      live.delete(span.spanContext().spanId)
    },
    forceFlush() {
      return Promise.resolve()
    },
    shutdown() {
      live.clear()
      return Promise.resolve()
    },
  }
}
