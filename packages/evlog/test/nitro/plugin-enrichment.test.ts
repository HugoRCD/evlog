import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getHeaders } from 'h3'
import type { DrainContext, EnrichContext, RequestLogger, ServerEvent, WideEvent } from '../../src/types'
import { filterSafeHeaders } from '../../src/utils'
import { createRequestLogger, initLogger } from '../../src/logger'

vi.mock('h3', () => ({
  getHeaders: vi.fn(),
}))

function getSafeHeaders(allHeaders: Record<string, string>): Record<string, string> {
  return filterSafeHeaders(allHeaders)
}


describe('nitro plugin - enrichment pipeline (T7)', () => {
  async function callEnrichAndDrain(
    nitroApp: {
      hooks: {
        callHook: (name: string, ctx: EnrichContext | DrainContext) => Promise<void>
      }
    },
    emittedEvent: WideEvent | null,
    event: ServerEvent,
  ): Promise<void> {
    if (!emittedEvent) return

    const allHeaders = getHeaders(event as Parameters<typeof getHeaders>[0])
    const hookContext = {
      request: { method: event.method, path: event.path, requestId: event.context.requestId as string | undefined },
      headers: getSafeHeaders(allHeaders),
      response: { status: 200 },
    }

    try {
      await nitroApp.hooks.callHook('evlog:enrich', { event: emittedEvent, ...hookContext })
    } catch (err) {
      console.error('[evlog] enrich failed:', err)
    }

    nitroApp.hooks.callHook('evlog:drain', {
      event: emittedEvent,
      request: hookContext.request,
      headers: hookContext.headers,
    }).catch((err) => {
      console.error('[evlog] drain failed:', err)
    })
  }

  it('calls enrich then drain in sequence', async () => {
    const callOrder: string[] = []
    const mockHeaders = { 'content-type': 'application/json' }
    vi.mocked(getHeaders).mockReturnValue(mockHeaders)

    const mockHooks = {
      callHook: vi.fn().mockImplementation((hookName: string) => {
        callOrder.push(hookName)
        return Promise.resolve()
      }),
    }

    const mockEvent: ServerEvent = {
      method: 'POST',
      path: '/api/test',
      context: { requestId: 'req-123' },
    }

    const emittedEvent: WideEvent = {
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'test',
      environment: 'test',
    }

    await callEnrichAndDrain({ hooks: mockHooks }, emittedEvent, mockEvent)

    expect(callOrder).toEqual(['evlog:enrich', 'evlog:drain'])
  })

  it('skips pipeline when emittedEvent is null', async () => {
    const mockHooks = {
      callHook: vi.fn().mockResolvedValue(undefined),
    }

    const mockEvent: ServerEvent = {
      method: 'GET',
      path: '/api/test',
      context: {},
    }

    await callEnrichAndDrain({ hooks: mockHooks }, null, mockEvent)

    expect(mockHooks.callHook).not.toHaveBeenCalled()
  })

  it('enrich errors do not prevent drain from running', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockHeaders = { 'content-type': 'application/json' }
    vi.mocked(getHeaders).mockReturnValue(mockHeaders)

    let drainCalled = false
    const mockHooks = {
      callHook: vi.fn().mockImplementation((hookName: string) => {
        if (hookName === 'evlog:enrich') {
          return Promise.reject(new Error('enrich boom'))
        }
        if (hookName === 'evlog:drain') {
          drainCalled = true
        }
        return Promise.resolve()
      }),
    }

    const mockEvent: ServerEvent = {
      method: 'POST',
      path: '/api/test',
      context: {},
    }

    const emittedEvent: WideEvent = {
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'test',
      environment: 'test',
    }

    await callEnrichAndDrain({ hooks: mockHooks }, emittedEvent, mockEvent)

    expect(drainCalled).toBe(true)
    expect(consoleSpy).toHaveBeenCalledWith('[evlog] enrich failed:', expect.any(Error))
    consoleSpy.mockRestore()
  })

  it('drain errors are logged but do not throw', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockHeaders = {}
    vi.mocked(getHeaders).mockReturnValue(mockHeaders)

    const mockHooks = {
      callHook: vi.fn().mockImplementation((hookName: string) => {
        if (hookName === 'evlog:drain') {
          return Promise.reject(new Error('drain boom'))
        }
        return Promise.resolve()
      }),
    }

    const mockEvent: ServerEvent = {
      method: 'GET',
      path: '/api/test',
      context: {},
    }

    const emittedEvent: WideEvent = {
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'test',
      environment: 'test',
    }

    // Should not throw
    await callEnrichAndDrain({ hooks: mockHooks }, emittedEvent, mockEvent)

    // Wait for drain promise to settle
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(consoleSpy).toHaveBeenCalledWith('[evlog] drain failed:', expect.any(Error))
    consoleSpy.mockRestore()
  })

  it('enricher can mutate the event before drain receives it', async () => {
    const mockHeaders = { 'user-agent': 'TestBot/1.0' }
    vi.mocked(getHeaders).mockReturnValue(mockHeaders)

    let drainEvent: WideEvent | null = null
    const mockHooks = {
      callHook: vi.fn().mockImplementation((hookName: string, ctx: EnrichContext | DrainContext) => {
        if (hookName === 'evlog:enrich') {
          (ctx as EnrichContext).event.enriched = true
          ;(ctx as EnrichContext).event.customField = 'added-by-enricher'
        }
        if (hookName === 'evlog:drain') {
          drainEvent = (ctx as DrainContext).event
        }
        return Promise.resolve()
      }),
    }

    const mockEvent: ServerEvent = {
      method: 'POST',
      path: '/api/test',
      context: {},
    }

    const emittedEvent: WideEvent = {
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'test',
      environment: 'test',
    }

    await callEnrichAndDrain({ hooks: mockHooks }, emittedEvent, mockEvent)

    expect(drainEvent).not.toBeNull()
    expect(drainEvent!.enriched).toBe(true)
    expect(drainEvent!.customField).toBe('added-by-enricher')
  })

  it('passes headers to both enrich and drain hooks', async () => {
    const mockHeaders = {
      'content-type': 'application/json',
      'x-request-id': 'req-456',
    }
    vi.mocked(getHeaders).mockReturnValue(mockHeaders)

    let enrichHeaders: Record<string, string> | undefined
    let drainHeaders: Record<string, string> | undefined
    const mockHooks = {
      callHook: vi.fn().mockImplementation((hookName: string, ctx: EnrichContext | DrainContext) => {
        if (hookName === 'evlog:enrich') {
          enrichHeaders = (ctx as EnrichContext).headers
        }
        if (hookName === 'evlog:drain') {
          drainHeaders = (ctx as DrainContext).headers
        }
        return Promise.resolve()
      }),
    }

    const mockEvent: ServerEvent = {
      method: 'POST',
      path: '/api/test',
      context: {},
    }

    const emittedEvent: WideEvent = {
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'test',
      environment: 'test',
    }

    await callEnrichAndDrain({ hooks: mockHooks }, emittedEvent, mockEvent)

    expect(enrichHeaders).toEqual(mockHeaders)
    expect(drainHeaders).toEqual(mockHeaders)
  })
})
