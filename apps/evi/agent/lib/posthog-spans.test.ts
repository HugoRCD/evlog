import type { Context, ContextManager, Tracer } from '@opentelemetry/api'
import { ROOT_CONTEXT, context, trace } from '@opentelemetry/api'
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createPostHogAttributeProcessor } from './posthog-spans'

/**
 * Nesting only resolves when a context manager is installed; without one every
 * span looks like a root and the processor has nothing to inherit from. A
 * synchronous stack is enough here and keeps the async-hooks package out of
 * the dependency list.
 */
class SyncContextManager implements ContextManager {
  private stack: Context[] = [ROOT_CONTEXT]

  active(): Context {
    return this.stack[this.stack.length - 1] ?? ROOT_CONTEXT
  }

  with<TArgs extends unknown[], TFn extends(...args: TArgs) => ReturnType<TFn>>(ctx: Context, fn: TFn, thisArg?: ThisParameterType<TFn>, ...args: TArgs): ReturnType<TFn> {
    this.stack.push(ctx)
    try {
      return fn.call(thisArg as ThisParameterType<TFn>, ...args)
    } finally {
      this.stack.pop()
    }
  }

  bind<T>(_ctx: Context, target: T): T {
    return target
  }

  enable(): this {
    return this
  }

  disable(): this {
    this.stack = [ROOT_CONTEXT]
    return this
  }
}

/**
 * The real SDK, not a hand-rolled `Context`: a fake whose `getValue` answers
 * any key hides whether propagation resolves the parent at all.
 */
let exporter: InMemorySpanExporter
let tracer: Tracer

beforeAll(() => {
  context.setGlobalContextManager(new SyncContextManager())
})

beforeEach(() => {
  exporter = new InMemorySpanExporter()
  tracer = new BasicTracerProvider({
    spanProcessors: [createPostHogAttributeProcessor(), new SimpleSpanProcessor(exporter)],
  }).getTracer('test')
})

function exported(name: string) {
  return exporter.getFinishedSpans().find(span => span.name === name)
}

describe('createPostHogAttributeProcessor', () => {
  it('carries posthog attributes to a child of the step span', () => {
    tracer.startActiveSpan('step 1', (step) => {
      // eve sets these after the span opens, which is the case that matters.
      step.setAttributes({ posthog_distinct_id: 'github:1', posthog_environment: 'eval' })
      tracer.startActiveSpan('chat', child => child.end())
      step.end()
    })

    expect(exported('chat')?.attributes.posthog_distinct_id).toBe('github:1')
    expect(exported('chat')?.attributes.posthog_environment).toBe('eval')
  })

  it('reaches a tool span two levels down', () => {
    tracer.startActiveSpan('step 1', (step) => {
      step.setAttributes({ posthog_distinct_id: 'github:1' })
      tracer.startActiveSpan('invoke_agent', (generation) => {
        tracer.startActiveSpan('execute_tool grep', tool => tool.end())
        generation.end()
      })
      step.end()
    })

    expect(exported('execute_tool grep')?.attributes.posthog_distinct_id).toBe('github:1')
  })

  it('lets a child override an inherited value', () => {
    tracer.startActiveSpan('step 1', (step) => {
      step.setAttributes({ posthog_distinct_id: 'github:1' })
      tracer.startActiveSpan('chat', { attributes: { posthog_distinct_id: 'github:2' } }, child => child.end())
      step.end()
    })

    expect(exported('chat')?.attributes.posthog_distinct_id).toBe('github:2')
  })

  it('leaves a span outside any turn untouched', () => {
    tracer.startActiveSpan('orphan', { attributes: { 'gen_ai.request.model': 'x' } }, span => span.end())

    expect(exported('orphan')?.attributes).toEqual({ 'gen_ai.request.model': 'x' })
  })

  it('ignores non-posthog attributes, which PostHog would drop anyway', () => {
    tracer.startActiveSpan('step 1', (step) => {
      step.setAttributes({ 'evlog.request_id': 'sess:turn_0' })
      tracer.startActiveSpan('chat', child => child.end())
      step.end()
    })

    expect(exported('chat')?.attributes).toEqual({})
  })

  it('forgets a span once it ends, so the map does not grow', () => {
    const step = tracer.startSpan('step 1')
    step.setAttributes({ posthog_distinct_id: 'github:1' })
    step.end()

    context.with(trace.setSpan(context.active(), step), () => {
      tracer.startSpan('late').end()
    })

    expect(exported('late')?.attributes).toEqual({})
  })
})
