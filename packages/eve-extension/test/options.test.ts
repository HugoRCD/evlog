import { describe, expect, it } from 'vitest'
import type { TailSamplingContext } from 'evlog'
import extension from '../extension/extension'
import { toHookOptions, type ExtensionConfig } from '../extension/lib/options'

function parseConfig(input: Record<string, unknown> = {}): ExtensionConfig {
  const result = extension.schema['~standard'].validate(input)
  if (result instanceof Promise) throw new Error('config schema must validate synchronously')
  if (result.issues) throw new Error(JSON.stringify(result.issues))
  return result.value as ExtensionConfig
}

function tailContext(overrides: Partial<TailSamplingContext> = {}): TailSamplingContext {
  return {
    status: 200,
    duration: 10,
    path: '/sessions/sess_1/turns/turn_0',
    method: 'EVE',
    context: {},
    shouldKeep: false,
    ...overrides,
  }
}

describe('extension config', () => {
  it('validates synchronously, as eve requires', () => {
    expect(() => parseConfig()).not.toThrow()
  })

  it('applies defaults so a bare mount is usable', () => {
    expect(parseConfig()).toMatchObject({
      adapter: 'fs',
      message: 'omit',
      redact: true,
      keepOnFailure: true,
      sessionEvent: false,
    })
  })

  it('rejects an unknown adapter', () => {
    expect(() => parseConfig({ adapter: 'splunk' })).toThrow()
  })

  it('rejects a sample rate outside 0..1', () => {
    expect(() => parseConfig({ sample: 1.5 })).toThrow()
  })
})

describe('toHookOptions', () => {
  it('names the service after the agent when the mount does not', () => {
    const options = toHookOptions(parseConfig(), 'support-agent')

    expect(options.init?.env?.service).toBe('support-agent')
  })

  it('prefers the configured service over the agent name', () => {
    const options = toHookOptions(parseConfig({ service: 'billing' }), 'support-agent')

    expect(options.init?.env?.service).toBe('billing')
  })

  it('maps the 0..1 sample rate onto evlog head sampling percentages', () => {
    const options = toHookOptions(parseConfig({ sample: 0.1 }), 'agent')

    expect(options.init?.sampling?.rates).toEqual({ info: 10 })
  })

  it('configures no sampling when the mount sets no rate', () => {
    const options = toHookOptions(parseConfig(), 'agent')

    expect(options.init?.sampling).toBeUndefined()
  })

  it('passes redact paths through', () => {
    const options = toHookOptions(parseConfig({ redact: { paths: ['order.card'] } }), 'agent')

    expect(options.redact).toEqual({ paths: ['order.card'] })
  })

  it('installs no keep callback when keepOnFailure is off', () => {
    const options = toHookOptions(parseConfig({ keepOnFailure: false }), 'agent')

    expect(options.keep).toBeUndefined()
  })
})

describe('keepOnFailure', () => {
  function keepFor(ctx: TailSamplingContext): boolean {
    const { keep } = toHookOptions(parseConfig(), 'agent')
    keep!(ctx)
    return ctx.shouldKeep
  }

  it('keeps a failed turn', () => {
    expect(keepFor(tailContext({ status: 500 }))).toBe(true)
  })

  it('keeps a rejected turn even though it succeeded', () => {
    expect(keepFor(tailContext({ context: { eve: { phase: 'rejected' } } }))).toBe(true)
  })

  it('keeps a turn whose authorization was declined', () => {
    expect(keepFor(tailContext({
      context: { eve: { authorizations: [{ outcome: 'declined' }] } },
    }))).toBe(true)
  })

  it('keeps a turn that retried a failed model step', () => {
    expect(keepFor(tailContext({
      context: { eve: { stepFailures: [{ code: 'RATE_LIMIT' }] } },
    }))).toBe(true)
  })

  it('leaves a cancelled turn to the sampling rate', () => {
    expect(keepFor(tailContext({ status: 499 }))).toBe(false)
  })

  it('leaves a routine turn to the sampling rate', () => {
    expect(keepFor(tailContext({
      context: { eve: { authorizations: [{ outcome: 'authorized' }] } },
    }))).toBe(false)
  })
})
