import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HookContext } from 'eve/hooks'
import { initLogger } from '../src/logger'
import {
  resetEvlogEveForTests,
  defineEvlogHook,
  useTurnLogger,
} from '../src/eve/index'
import {
  assertDrainCalledWith,
  assertEnrichBeforeDrain,
  assertWideEventShape,
  createPipelineSpies,
  findEventViaDrain,
  waitForDrainCalls,
} from './helpers/framework'

const SESSION_ID = 'sess_abc'
const TURN_ID = 'turn_0'

function hookContext(overrides: Partial<HookContext> = {}): HookContext {
  return {
    agent: { name: 'test-agent' },
    channel: { kind: 'http' },
    session: { id: SESSION_ID },
    ...overrides,
  } as HookContext
}

function toolContext(turnId = TURN_ID) {
  return {
    session: {
      id: SESSION_ID,
      turn: { id: turnId },
    },
  }
}

async function runTurn(
  hook: ReturnType<typeof defineEvlogHook>,
  options: {
    fail?: boolean
    steps?: number
    toolResults?: Array<{ toolName: string, status: 'completed' | 'failed' | 'rejected' }>
    message?: string
  } = {},
) {
  const ctx = hookContext()
  const events = hook.events!

  events['turn.started']!({
    type: 'turn.started',
    data: { sequence: 0, turnId: TURN_ID },
  }, ctx)

  if (options.message !== undefined) {
    events['message.received']!({
      type: 'message.received',
      data: { message: options.message, sequence: 1, turnId: TURN_ID },
    }, ctx)
  }

  const stepCount = options.steps ?? 1
  for (let i = 0; i < stepCount; i++) {
    events['step.completed']!({
      type: 'step.completed',
      data: {
        finishReason: i === stepCount - 1 ? 'stop' : 'tool-calls',
        sequence: 2 + i,
        stepIndex: i,
        turnId: TURN_ID,
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 10,
        },
      },
    }, ctx)
  }

  for (const [index, tool] of (options.toolResults ?? []).entries()) {
    events['action.result']!({
      type: 'action.result',
      data: {
        result: { toolName: tool.toolName },
        sequence: 10 + index,
        stepIndex: 0,
        status: tool.status,
        turnId: TURN_ID,
        ...(tool.status === 'failed'
          ? { error: { code: 'TOOL_FAILED', message: 'tool broke' } }
          : {}),
      },
    }, ctx)
  }

  if (options.fail) {
    await events['turn.failed']!({
      type: 'turn.failed',
      data: {
        code: 'TURN_ERROR',
        message: 'turn exploded',
        sequence: 99,
        turnId: TURN_ID,
      },
    }, ctx)
  } else {
    await events['turn.completed']!({
      type: 'turn.completed',
      data: { sequence: 99, turnId: TURN_ID },
    }, ctx)
  }
}

describe('evlog/eve', () => {
  beforeEach(() => {
    resetEvlogEveForTests()
    initLogger({ env: { service: 'eve-test' } })
  })

  afterEach(() => {
    resetEvlogEveForTests()
  })

  it('creates a turn logger on turn.started with session context', async () => {
    const spies = createPipelineSpies()
    const hook = defineEvlogHook({ drain: spies.drain })

    await runTurn(hook)

    await waitForDrainCalls(spies.drain)
    const event = findEventViaDrain(spies.drain, e => e.path?.includes(TURN_ID))
    expect(event).toBeDefined()
    expect(event?.method).toBe('EVE')
    expect(event?.eve).toMatchObject({
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      turnSequence: 0,
    })
    expect(event?.agent).toMatchObject({ name: 'test-agent' })
    expect(event?.channel).toMatchObject({ kind: 'http' })
  })

  it('accumulates token usage across multiple steps', async () => {
    const spies = createPipelineSpies()
    const hook = defineEvlogHook({ drain: spies.drain })

    await runTurn(hook, { steps: 2 })

    await waitForDrainCalls(spies.drain)
    const event = findEventViaDrain(spies.drain, () => true)
    expect(event?.ai).toMatchObject({
      calls: 2,
      steps: 2,
      inputTokens: 200,
      outputTokens: 100,
      cacheReadTokens: 20,
      totalTokens: 300,
      finishReason: 'stop',
    })
  })

  it('records tool executions from action.result', async () => {
    const spies = createPipelineSpies()
    const hook = defineEvlogHook({ drain: spies.drain })

    await runTurn(hook, {
      toolResults: [
        { toolName: 'get_weather', status: 'completed' },
        { toolName: 'search', status: 'failed' },
      ],
    })

    await waitForDrainCalls(spies.drain)
    const event = findEventViaDrain(spies.drain, () => true)
    expect(event?.ai?.tools).toEqual([
      { name: 'get_weather', durationMs: 0, success: true },
      { name: 'search', durationMs: 0, success: false, error: 'tool broke' },
    ])
  })

  it('emits a valid wide event on turn.completed', async () => {
    const spies = createPipelineSpies()
    const hook = defineEvlogHook({ drain: spies.drain })

    await runTurn(hook)

    await waitForDrainCalls(spies.drain)
    const event = findEventViaDrain(spies.drain, () => true)
    assertWideEventShape(event!)
    expect(event?.method).toBe('EVE')
    expect(event?.path).toBe(`/sessions/${SESSION_ID}/turns/${TURN_ID}`)
    expect(event?.status).toBe(200)
  })

  it('captures turn.failed as an error wide event', async () => {
    const spies = createPipelineSpies()
    const hook = defineEvlogHook({ drain: spies.drain })

    await runTurn(hook, { fail: true })

    await waitForDrainCalls(spies.drain)
    const event = findEventViaDrain(spies.drain, () => true)
    expect(event?.level).toBe('error')
    expect(event?.status).toBe(500)
    expect(event?.eve?.failure).toMatchObject({
      code: 'TURN_ERROR',
      message: 'turn exploded',
    })
  })

  it('does not throw when an internal handler fails', async () => {
    const hook = defineEvlogHook({
      enrich: () => {
        throw new Error('enrich exploded')
      },
      drain: vi.fn(),
    })

    await expect(runTurn(hook)).resolves.toBeUndefined()
  })

  it('useTurnLogger returns the active turn logger', async () => {
    const spies = createPipelineSpies()
    const hook = defineEvlogHook({ drain: spies.drain })
    const ctx = hookContext()

    hook.events!['turn.started']!({
      type: 'turn.started',
      data: { sequence: 0, turnId: TURN_ID },
    }, ctx)

    const log = useTurnLogger(toolContext())
    log.set({ business: { tenant: 'acme' } })

    await hook.events!['turn.completed']!({
      type: 'turn.completed',
      data: { sequence: 1, turnId: TURN_ID },
    }, ctx)

    await waitForDrainCalls(spies.drain)
    const event = findEventViaDrain(spies.drain, () => true)
    expect(event?.business).toEqual({ tenant: 'acme' })
  })

  it('useTurnLogger throws outside an active turn', () => {
    expect(() => useTurnLogger()).toThrow(/outside an evlog Eve turn/)
  })

  it('keep callback can force-keep failed tool turns', async () => {
    const spies = createPipelineSpies()
    const hook = defineEvlogHook({
      drain: spies.drain,
      keep: (ctx) => {
        const tools = (ctx.context.ai as { tools?: Array<{ success: boolean }> } | undefined)?.tools
        if (tools?.some(t => !t.success)) ctx.shouldKeep = true
      },
    })

    await runTurn(hook, {
      toolResults: [{ toolName: 'broken', status: 'failed' }],
    })

    await waitForDrainCalls(spies.drain)
    assertDrainCalledWith(spies.drain, {
      path: `/sessions/${SESSION_ID}/turns/${TURN_ID}`,
      method: 'EVE',
    })
  })

  it('runs enrich before drain', async () => {
    const spies = createPipelineSpies()
    const hook = defineEvlogHook({
      drain: spies.drain,
      enrich: spies.enrich,
    })

    await runTurn(hook)

    await waitForDrainCalls(spies.drain)
    assertEnrichBeforeDrain(spies.enrich, spies.drain)
  })

  it('redacts message.received by default', async () => {
    const spies = createPipelineSpies()
    const hook = defineEvlogHook({ drain: spies.drain })

    await runTurn(hook, { message: 'secret user prompt' })

    await waitForDrainCalls(spies.drain)
    const event = findEventViaDrain(spies.drain, () => true)
    expect(event?.message).toEqual({ receivedRedacted: true })
    expect(event?.message).not.toHaveProperty('received')
  })

  it('includes truncated message when redactMessage is false', async () => {
    const spies = createPipelineSpies()
    const hook = defineEvlogHook({ drain: spies.drain, redactMessage: false })

    await runTurn(hook, { message: 'hello from user' })

    await waitForDrainCalls(spies.drain)
    const event = findEventViaDrain(spies.drain, () => true)
    expect(event?.message).toEqual({ received: 'hello from user' })
  })

  it('shares turn state across separate evlog/eve module instances (Eve authored-module bundles)', async () => {
    const spies = createPipelineSpies()
    const hookModule = await import('../src/eve/index')
    hookModule.resetEvlogEveForTests()
    initLogger({ env: { service: 'eve-test' } })

    const hook = hookModule.defineEvlogHook({ drain: spies.drain })
    const ctx = hookContext()

    hook.events!['turn.started']!({
      type: 'turn.started',
      data: { sequence: 0, turnId: TURN_ID },
    }, ctx)

    vi.resetModules()
    const toolModule = await import('../src/eve/index')
    const log = toolModule.useTurnLogger(toolContext())
    log.set({ business: { tenant: 'acme' } })

    await hook.events!['turn.completed']!({
      type: 'turn.completed',
      data: { sequence: 1, turnId: TURN_ID },
    }, ctx)

    await waitForDrainCalls(spies.drain)
    const event = findEventViaDrain(spies.drain, () => true)
    expect(event?.business).toEqual({ tenant: 'acme' })

    const fresh = await import('../src/eve/index')
    fresh.resetEvlogEveForTests()
  })
})
