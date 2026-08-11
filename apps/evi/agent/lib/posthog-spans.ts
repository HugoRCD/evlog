import { trace, type Attributes, type Context } from '@opentelemetry/api'
import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-base'

/** PostHog keeps only `posthog_`-prefixed span attributes; everything else is dropped. */
const POSTHOG_PREFIX = 'posthog_'

/**
 * Carry a turn's `posthog_*` attributes down its span tree.
 *
 * eve applies the runtime context returned by `step.started` to the step span
 * alone. Generation spans hang beneath it and inherit nothing, so without this
 * the events that carry cost reach PostHog with no environment and no
 * identity — and PostHog then invents an anonymous person per generation.
 */
export function createPostHogAttributeProcessor(): SpanProcessor {
  const inherited = new Map<string, Attributes>()

  return {
    onStart(span: Span, parentContext: Context) {
      const parentSpanId = trace.getSpanContext(parentContext)?.spanId
      const fromParent = parentSpanId ? inherited.get(parentSpanId) : undefined

      const own: Attributes = {}
      for (const [key, value] of Object.entries(span.attributes)) {
        if (key.startsWith(POSTHOG_PREFIX) && value !== undefined) own[key] = value
      }

      const merged = { ...fromParent, ...own }
      if (Object.keys(merged).length === 0) return

      span.setAttributes(merged)
      inherited.set(span.spanContext().spanId, merged)
    },
    onEnd(span: ReadableSpan) {
      inherited.delete(span.spanContext().spanId)
    },
    forceFlush() {
      return Promise.resolve()
    },
    shutdown() {
      inherited.clear()
      return Promise.resolve()
    },
  }
}
