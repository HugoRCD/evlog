import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HookContext } from 'eve/hooks'
import { initLogger } from '../src/logger'
import {
  resetEvlogEveForTests,
  defineEvlogHook,
  useLogger,
  detachActiveTurnLoggerForTests,
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
const TURN_ID_1 = 'turn_1'

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
    turnId?: string
    fail?: boolean
    steps?: number
    toolResults?: Array<{
      toolName: string
      callId?: string
      status: 'completed' | 'failed' | 'rejected'
      delayMs?: number
    }>
    toolRequests?: Array<{ toolName: string, callId: string }>
    message?: string
    inputRequests?: Array<{ requestId: string, toolName: string, prompt: string }>
    subagents?: Array<{ phase: 'called' | 'completed', callId: string, name: string }>
  } = {},
) {
  const turnId = options.turnId ?? TURN_ID
  const ctx = hookContext()
  const events = hook.events!

  events['turn.started']!({
    type: 'turn.started',
    data: { sequence: 0, turnId },
  }, ctx)

  if (options.message !== undefined) {
    events['message.received']!({
      type: 'message.received',
      data: { message: options.message, sequence: 1, turnId },
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
        turnId,
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 10,
        },
      },
    }, ctx)
  }

  for (const [index, req] of (options.toolRequests ?? []).entries()) {
    events['actions.requested']!({
      type: 'actions.requested',
      data: {
        actions: [
          {
            callId: req.callId,
            kind: 'tool-call',
            toolName: req.toolName,
            input: {},
          },
        ],
        sequence: 5 + index,
        stepIndex: 0,
        turnId,
      },
    }, ctx)
  }

  for (const [index, req] of (options.inputRequests ?? []).entries()) {
    events['input.requested']!({
      type: 'input.requested',
      data: {
        requests: [
          {
            requestId: req.requestId,
            prompt: req.prompt,
            action: {
              callId: `call_${req.toolName}`,
              kind: 'tool-call',
              toolName: req.toolName,
              input: {},
            },
          },
        ],
        sequence: 7 + index,
        stepIndex: 0,
        turnId,
      },
    }, ctx)
  }

  for (const [index, sub] of (options.subagents ?? []).entries()) {
    if (sub.phase === 'called') {
      events['subagent.called']!({
        type: 'subagent.called',
        data: {
          callId: sub.callId,
          childSessionId: `child_${sub.callId}`,
          sessionId: SESSION_ID,
          sequence: 20 + index,
          name: sub.name,
          toolName: 'delegate',
          turnId,
          workflowId: 'wf_1',
        },
      }, ctx)
    } else {
      events['subagent.completed']!({
        type: 'subagent.completed',
        data: {
          callId: sub.callId,
          output: 'done',
          subagentName: sub.name,
        },
      }, ctx)
    }
  }

  for (const [index, tool] of (options.toolResults ?? []).entries()) {
    if (tool.delayMs) await new Promise(r => setTimeout(r, tool.delayMs))
    events['action.result']!({
      type: 'action.result',
      data: {
        result: {
          callId: tool.callId ?? `call_${tool.toolName}`,
          kind: 'tool-result',
          toolName: tool.toolName,
          output: {},
        },
        sequence: 10 + index,
        stepIndex: 0,
        status: tool.status,
        turnId,
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
        turnId,
      },
    }, ctx)
  } else {
    await events['turn.completed']!({
      type: 'turn.completed',
      data: { sequence: 99, turnId },
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

  it('records tool executions with duration from actions.requested', async () => {
    const spies = createPipelineSpies()
    const hook = defineEvlogHook({ drain: spies.drain })

    await runTurn(hook, {
      toolRequests: [{ toolName: 'get_weather', callId: 'call_weather' }],
      toolResults: [
        { toolName: 'get_weather', callId: 'call_weather', status: 'completed', delayMs: 15 },
        { toolName: 'search', callId: 'call_search', status: 'failed' },
      ],
    })

    await waitForDrainCalls(spies.drain)
    const event = findEventViaDrain(spies.drain, () => true)
    expect(event?.ai?.tools?.[0]?.name).toBe('get_weather')
    expect(event?.ai?.tools?.[0]?.durationMs).toBeGreaterThan(0)
    expect(event?.ai?.tools?.[1]).toEqual({
      name: 'search',
      durationMs: 0,
      success: false,
      error: 'tool broke',
    })
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

  it('useLogger returns the active turn logger via ctx', async () => {
    const spies = createPipelineSpies()
    const hook = defineEvlogHook({ drain: spies.drain })
    const ctx = hookContext()

    hook.events!['turn.started']!({
      type: 'turn.started',
      data: { sequence: 0, turnId: TURN_ID },
    }, ctx)

    const log = useLogger(toolContext())
    log.set({ business: { tenant: 'acme' } })

    await hook.events!['turn.completed']!({
      type: 'turn.completed',
      data: { sequence: 1, turnId: TURN_ID },
    }, ctx)

    await waitForDrainCalls(spies.drain)
    const event = findEventViaDrain(spies.drain, () => true)
    expect(event?.business).toEqual({ tenant: 'acme' })
  })

  it('useLogger resolves from AsyncLocalStorage after turn.started', async () => {
    const spies = createPipelineSpies()
    const hook = defineEvlogHook({ drain: spies.drain })
    const ctx = hookContext()

    hook.events!['turn.started']!({
      type: 'turn.started',
      data: { sequence: 0, turnId: TURN_ID },
    }, ctx)

    const log = useLogger()
    log.set({ business: { tenant: 'als-acme' } })

    await hook.events!['turn.completed']!({
      type: 'turn.completed',
      data: { sequence: 1, turnId: TURN_ID },
    }, ctx)

    await waitForDrainCalls(spies.drain)
    const event = findEventViaDrain(spies.drain, () => true)
    expect(event?.business).toEqual({ tenant: 'als-acme' })
  })

  it('useLogger resolves from the sole active turn without ctx or ALS', async () => {
    const spies = createPipelineSpies()
    const hook = defineEvlogHook({ drain: spies.drain })
    const ctx = hookContext()

    hook.events!['turn.started']!({
      type: 'turn.started',
      data: { sequence: 0, turnId: TURN_ID },
    }, ctx)

    detachActiveTurnLoggerForTests()

    const log = useLogger()
    log.set({ business: { tenant: 'active-turn' } })

    await hook.events!['turn.completed']!({
      type: 'turn.completed',
      data: { sequence: 1, turnId: TURN_ID },
    }, ctx)

    await waitForDrainCalls(spies.drain)
    const event = findEventViaDrain(spies.drain, () => true)
    expect(event?.business).toEqual({ tenant: 'active-turn' })
  })

  it('useLogger throws outside an active turn', () => {
    expect(() => useLogger()).toThrow(/outside an evlog eve turn/)
  })

  it('carries business context across turns in the same session', async () => {
    const spies = createPipelineSpies()
    const hook = defineEvlogHook({ drain: spies.drain })
    const ctx = hookContext()

    hook.events!['turn.started']!({
      type: 'turn.started',
      data: { sequence: 0, turnId: TURN_ID },
    }, ctx)
    const log = useLogger(toolContext())
    log.set({
      customer: { slug: 'acme' },
      order: { id: '4821' },
    })
    await hook.events!['turn.completed']!({
      type: 'turn.completed',
      data: { sequence: 1, turnId: TURN_ID },
    }, ctx)

    hook.events!['turn.started']!({
      type: 'turn.started',
      data: { sequence: 1, turnId: TURN_ID_1 },
    }, ctx)
    const log2 = useLogger(toolContext(TURN_ID_1))
    log2.set({ refund: { amount: 890 } })
    await hook.events!['turn.completed']!({
      type: 'turn.completed',
      data: { sequence: 2, turnId: TURN_ID_1 },
    }, ctx)

    await waitForDrainCalls(spies.drain, 2)
    const secondTurn = findEventViaDrain(spies.drain, e => e.path?.includes(TURN_ID_1))
    expect(secondTurn?.customer).toEqual({ slug: 'acme' })
    expect(secondTurn?.order).toEqual({ id: '4821' })
    expect(secondTurn?.refund).toEqual({ amount: 890 })
  })

  it('records approval approved and tool duration after cross-turn resume', async () => {
    const spies = createPipelineSpies()
    const hook = defineEvlogHook({ drain: spies.drain })
    const ctx = hookContext()
    const events = hook.events!
    const callId = 'call_issue_refund'

    events['turn.started']!({
      type: 'turn.started',
      data: { sequence: 0, turnId: TURN_ID },
    }, ctx)
    events['actions.requested']!({
      type: 'actions.requested',
      data: {
        actions: [
          {
            callId,
            kind: 'tool-call',
            toolName: 'issue_refund',
            input: {},
          },
        ],
        sequence: 1,
        stepIndex: 0,
        turnId: TURN_ID,
      },
    }, ctx)
    events['input.requested']!({
      type: 'input.requested',
      data: {
        requests: [
          {
            requestId: 'req_1',
            prompt: 'Approve refund of $890?',
            action: {
              callId,
              kind: 'tool-call',
              toolName: 'issue_refund',
              input: {},
            },
          },
        ],
        sequence: 2,
        stepIndex: 0,
        turnId: TURN_ID,
      },
    }, ctx)
    await events['turn.completed']!({
      type: 'turn.completed',
      data: { sequence: 3, turnId: TURN_ID },
    }, ctx)

    events['turn.started']!({
      type: 'turn.started',
      data: { sequence: 1, turnId: TURN_ID_1 },
    }, ctx)
    events['step.started']!({
      type: 'step.started',
      data: { sequence: 4, stepIndex: 0, turnId: TURN_ID_1 },
    }, ctx)
    await new Promise(r => setTimeout(r, 15))
    events['action.result']!({
      type: 'action.result',
      data: {
        result: {
          callId,
          kind: 'tool-result',
          toolName: 'issue_refund',
          output: {},
        },
        sequence: 5,
        stepIndex: 0,
        status: 'completed',
        turnId: TURN_ID_1,
      },
    }, ctx)
    await events['turn.completed']!({
      type: 'turn.completed',
      data: { sequence: 6, turnId: TURN_ID_1 },
    }, ctx)

    await waitForDrainCalls(spies.drain, 2)
    const firstTurn = findEventViaDrain(spies.drain, e => e.path?.includes(TURN_ID))
    const secondTurn = findEventViaDrain(spies.drain, e => e.path?.includes(TURN_ID_1))
    expect(firstTurn?.approval).toMatchObject({
      status: 'pending',
      tool: 'issue_refund',
    })
    expect(secondTurn?.approval).toMatchObject({
      status: 'approved',
      tool: 'issue_refund',
    })
    expect(secondTurn?.ai?.tools?.[0]?.durationMs).toBeGreaterThan(0)
  })

  it('tracks session turn count and phase across approval turns', async () => {
    const spies = createPipelineSpies()
    const hook = defineEvlogHook({ drain: spies.drain })
    const ctx = hookContext()
    const events = hook.events!
    const callId = 'call_issue_refund'

    events['turn.started']!({
      type: 'turn.started',
      data: { sequence: 0, turnId: TURN_ID },
    }, ctx)
    events['input.requested']!({
      type: 'input.requested',
      data: {
        requests: [
          {
            requestId: 'req_1',
            prompt: 'Approve refund of $890?',
            action: {
              callId,
              kind: 'tool-call',
              toolName: 'issue_refund',
              input: {},
            },
          },
        ],
        sequence: 1,
        stepIndex: 0,
        turnId: TURN_ID,
      },
    }, ctx)
    await events['turn.completed']!({
      type: 'turn.completed',
      data: { sequence: 2, turnId: TURN_ID },
    }, ctx)

    events['turn.started']!({
      type: 'turn.started',
      data: { sequence: 1, turnId: TURN_ID_1 },
    }, ctx)
    events['action.result']!({
      type: 'action.result',
      data: {
        result: {
          callId,
          kind: 'tool-result',
          toolName: 'issue_refund',
          output: {},
        },
        sequence: 3,
        stepIndex: 0,
        status: 'completed',
        turnId: TURN_ID_1,
      },
    }, ctx)
    await events['turn.completed']!({
      type: 'turn.completed',
      data: { sequence: 4, turnId: TURN_ID_1 },
    }, ctx)

    await waitForDrainCalls(spies.drain, 2)
    const firstTurn = findEventViaDrain(spies.drain, e => e.path?.includes(TURN_ID))
    const secondTurn = findEventViaDrain(spies.drain, e => e.path?.includes(TURN_ID_1))

    expect(firstTurn?.eve?.phase).toBe('awaiting-approval')
    expect(firstTurn?.eve?.sessionTurns).toBe(1)
    expect(secondTurn?.eve?.sessionTurns).toBe(2)
    expect(secondTurn?.approval).toMatchObject({ status: 'approved', tool: 'issue_refund' })
    expect(secondTurn?.path).toContain(TURN_ID_1)
    expect(firstTurn?.path).toContain(TURN_ID)
  })

  it('records approval pending and rejected tool results', async () => {
    const spies = createPipelineSpies()
    const hook = defineEvlogHook({ drain: spies.drain })

    await runTurn(hook, {
      inputRequests: [
        {
          requestId: 'req_1',
          toolName: 'issue_refund',
          prompt: 'Approve refund of $890?',
        },
      ],
      toolResults: [
        {
          toolName: 'issue_refund',
          callId: 'call_issue_refund',
          status: 'rejected',
        },
      ],
    })

    await waitForDrainCalls(spies.drain)
    const event = findEventViaDrain(spies.drain, () => true)
    expect(event?.eve?.phase).toBe('rejected')
    expect(event?.approval).toMatchObject({
      status: 'rejected',
      tool: 'issue_refund',
    })
    expect(event?.ai?.tools?.[0]).toMatchObject({
      name: 'issue_refund',
      success: false,
      error: 'rejected',
    })
  })

  it('estimates cost when cost map and model are configured', async () => {
    const spies = createPipelineSpies()
    const hook = defineEvlogHook({
      drain: spies.drain,
      cost: { 'anthropic/claude-sonnet-4.6': { input: 3, output: 15 } },
      model: 'anthropic/claude-sonnet-4.6',
    })

    await runTurn(hook)

    await waitForDrainCalls(spies.drain)
    const event = findEventViaDrain(spies.drain, () => true)
    expect(event?.ai?.model).toBe('anthropic/claude-sonnet-4.6')
    expect(event?.ai?.estimatedCost).toBeGreaterThan(0)
  })

  it('records subagent.called and subagent.completed', async () => {
    const spies = createPipelineSpies()
    const hook = defineEvlogHook({ drain: spies.drain })

    await runTurn(hook, {
      subagents: [
        { phase: 'called', callId: 'sub_1', name: 'researcher' },
        { phase: 'completed', callId: 'sub_1', name: 'researcher' },
      ],
    })

    await waitForDrainCalls(spies.drain)
    const event = findEventViaDrain(spies.drain, () => true)
    expect(event?.eve?.subagents).toEqual([
      {
        callId: 'sub_1',
        name: 'researcher',
        toolName: 'delegate',
        childSessionId: 'child_sub_1',
        status: 'completed',
        output: 'done',
      },
    ])
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

  it('omits message.received content by default', async () => {
    const spies = createPipelineSpies()
    const hook = defineEvlogHook({ drain: spies.drain })

    await runTurn(hook, { message: 'secret user prompt' })

    await waitForDrainCalls(spies.drain)
    const event = findEventViaDrain(spies.drain, () => true)
    expect(event?.message).toBeUndefined()
  })

  it('includes truncated message when redactMessage is false', async () => {
    const spies = createPipelineSpies()
    const hook = defineEvlogHook({ drain: spies.drain, redactMessage: false })

    await runTurn(hook, { message: 'hello from user' })

    await waitForDrainCalls(spies.drain)
    const event = findEventViaDrain(spies.drain, () => true)
    expect(event?.message).toEqual({ received: 'hello from user' })
  })

  it('uses continuing instead of raw continuationToken', async () => {
    const spies = createPipelineSpies()
    const hook = defineEvlogHook({ drain: spies.drain })
    const ctx = hookContext({
      channel: { kind: 'http', continuationToken: 'very-long-opaque-token-value' },
    })

    hook.events!['turn.started']!({
      type: 'turn.started',
      data: { sequence: 0, turnId: TURN_ID },
    }, ctx)
    await hook.events!['turn.completed']!({
      type: 'turn.completed',
      data: { sequence: 1, turnId: TURN_ID },
    }, ctx)

    await waitForDrainCalls(spies.drain)
    const event = findEventViaDrain(spies.drain, () => true)
    expect(event?.channel).toMatchObject({ kind: 'http', continuing: true })
    expect(event?.channel).not.toHaveProperty('continuationToken')
  })

  it('shares turn state across separate evlog/eve module instances (eve authored-module bundles)', async () => {
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
    const log = toolModule.useLogger(toolContext())
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

  it('clears turn state when finish fails', async () => {
    const hook = defineEvlogHook({
      drain: () => {
        throw new Error('drain unavailable')
      },
    })

    await runTurn(hook)

    expect(() => useLogger(toolContext())).toThrow(/could not find a logger/)
  })

  it('evicts oldest sessions when maxSessions is exceeded', async () => {
    const spies = createPipelineSpies()
    const hook = defineEvlogHook({ drain: spies.drain, maxSessions: 1 })
    const ctx = hookContext()

    hook.events!['turn.started']!({
      type: 'turn.started',
      data: { sequence: 0, turnId: 'turn_old' },
    }, { ...ctx, session: { id: 'sess_old' } })
    useLogger({ session: { id: 'sess_old', turn: { id: 'turn_old' } } })
      .set({ customer: { slug: 'old' } })
    await hook.events!['turn.completed']!({
      type: 'turn.completed',
      data: { sequence: 1, turnId: 'turn_old' },
    }, { ...ctx, session: { id: 'sess_old' } })

    hook.events!['turn.started']!({
      type: 'turn.started',
      data: { sequence: 0, turnId: TURN_ID },
    }, ctx)
    useLogger(toolContext()).set({ customer: { slug: 'new' } })
    await hook.events!['turn.completed']!({
      type: 'turn.completed',
      data: { sequence: 1, turnId: TURN_ID },
    }, ctx)

    hook.events!['turn.started']!({
      type: 'turn.started',
      data: { sequence: 1, turnId: TURN_ID_1 },
    }, ctx)
    const log = useLogger(toolContext(TURN_ID_1))
    await hook.events!['turn.completed']!({
      type: 'turn.completed',
      data: { sequence: 2, turnId: TURN_ID_1 },
    }, ctx)

    await waitForDrainCalls(spies.drain, 3)
    const latestTurn = findEventViaDrain(spies.drain, e => e.path?.includes(TURN_ID_1))
    expect(latestTurn?.customer).toEqual({ slug: 'new' })
    expect(latestTurn?.customer).not.toEqual({ slug: 'old' })
  })

  it('does not reinitialize an existing logger on first turn', async () => {
    resetEvlogEveForTests()
    initLogger({ env: { service: 'existing-app' } })

    const initSpy = vi.spyOn(await import('../src/logger'), 'initLogger')
    const spies = createPipelineSpies()
    await runTurn(defineEvlogHook({ drain: spies.drain, init: { env: { service: 'eve-agent' } } }))

    expect(initSpy).not.toHaveBeenCalled()
    initSpy.mockRestore()
  })
})
