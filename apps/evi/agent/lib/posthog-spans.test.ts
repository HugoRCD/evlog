import type { Attributes, Context } from '@opentelemetry/api'
import type { ReadableSpan, Span } from '@opentelemetry/sdk-trace-base'
import { describe, expect, it } from 'vitest'
import { createPostHogAttributeProcessor } from './posthog-spans'

function fakeSpan(spanId: string, attributes: Attributes = {}) {
  const span = {
    attributes: { ...attributes },
    spanContext: () => ({ spanId, traceId: 'trace', traceFlags: 1 }),
    setAttributes(next: Attributes) {
      Object.assign(span.attributes, next)
      return span
    },
  }
  return span as unknown as Span & ReadableSpan & { attributes: Attributes }
}

/** A context whose active span is `spanId`, as the SDK passes to `onStart`. */
function contextWithParent(spanId: string): Context {
  return {
    getValue: () => ({ spanContext: () => ({ spanId, traceId: 'trace', traceFlags: 1 }) }),
  } as unknown as Context
}


describe('createPostHogAttributeProcessor', () => {
  it('carries posthog attributes from a step span to its children', () => {
    const processor = createPostHogAttributeProcessor()
    const step = fakeSpan('step-1', { posthog_distinct_id: 'github:1', posthog_environment: 'eval' })

    processor.onStart(step, contextWithParent('root'))
    const generation = fakeSpan('gen-1', { 'gen_ai.request.model': 'x' })
    processor.onStart(generation, contextWithParent('step-1'))

    expect(generation.attributes.posthog_distinct_id).toBe('github:1')
    expect(generation.attributes.posthog_environment).toBe('eval')
    expect(generation.attributes['gen_ai.request.model']).toBe('x')
  })

  it('reaches grandchildren, since a generation nests below the step', () => {
    const processor = createPostHogAttributeProcessor()
    processor.onStart(fakeSpan('step-1', { posthog_distinct_id: 'github:1' }), contextWithParent('root'))
    processor.onStart(fakeSpan('gen-1'), contextWithParent('step-1'))

    const toolCall = fakeSpan('tool-1')
    processor.onStart(toolCall, contextWithParent('gen-1'))

    expect(toolCall.attributes.posthog_distinct_id).toBe('github:1')
  })

  it('lets a child override an inherited value', () => {
    const processor = createPostHogAttributeProcessor()
    processor.onStart(fakeSpan('step-1', { posthog_distinct_id: 'github:1' }), contextWithParent('root'))

    const child = fakeSpan('gen-1', { posthog_distinct_id: 'github:2' })
    processor.onStart(child, contextWithParent('step-1'))

    expect(child.attributes.posthog_distinct_id).toBe('github:2')
  })

  it('leaves spans outside a turn untouched', () => {
    const processor = createPostHogAttributeProcessor()

    const orphan = fakeSpan('other-1', { 'gen_ai.request.model': 'x' })
    processor.onStart(orphan, contextWithParent('unknown'))

    expect(orphan.attributes).toEqual({ 'gen_ai.request.model': 'x' })
  })

  it('ignores non-posthog attributes, which PostHog would drop anyway', () => {
    const processor = createPostHogAttributeProcessor()
    processor.onStart(fakeSpan('step-1', { 'evlog.request_id': 'sess:turn_0' }), contextWithParent('root'))

    const child = fakeSpan('gen-1')
    processor.onStart(child, contextWithParent('step-1'))

    expect(child.attributes).toEqual({})
  })

  it('forgets a span once it ends, so the map does not grow', async () => {
    const processor = createPostHogAttributeProcessor()
    const step = fakeSpan('step-1', { posthog_distinct_id: 'github:1' })

    processor.onStart(step, contextWithParent('root'))
    processor.onEnd(step)

    const late = fakeSpan('gen-1')
    processor.onStart(late, contextWithParent('step-1'))

    expect(late.attributes).toEqual({})
    await expect(processor.shutdown()).resolves.toBeUndefined()
  })
})
