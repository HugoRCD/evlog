import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { describe, expect, it, vi } from 'vitest'
import type { RequestLogger } from 'evlog'
import { evlog, useLogger, type MyFrameworkContext } from '../src/index'

interface TestShape { user?: { id: string } }

function makeContext(method = 'GET', path = '/health'): MyFrameworkContext {
  const socket = new Socket()
  const req = new IncomingMessage(socket)
  req.method = method
  req.url = path
  req.headers = { 'x-request-id': 'req-1' }
  const res = new ServerResponse(req)
  res.statusCode = 200
  return { req, res, route: { method, path } }
}

describe('evlog framework skeleton', () => {
  it('attaches a logger and runs the handler inside ALS', async () => {
    let observed: RequestLogger<TestShape> | undefined
    const drain = vi.fn()

    const middleware = evlog({ drain })
    const ctx = makeContext()

    await middleware(ctx, async () => {
      observed = useLogger<TestShape>()
      observed.set({ user: { id: 'u-1' } })
    })

    expect(ctx.log).toBeDefined()
    expect(ctx.log).toBe(observed)
    expect(drain).toHaveBeenCalledTimes(1)
    const event = (drain.mock.calls[0]?.[0] as { event: { user?: { id: string } } }).event
    expect(event.user?.id).toBe('u-1')
  })

  it('reports errors via finish({ error }) and re-throws', async () => {
    const drain = vi.fn()
    const middleware = evlog({ drain })
    const ctx = makeContext('POST', '/boom')

    await expect(middleware(ctx, () => {
      throw new Error('explosion')
    })).rejects.toThrow('explosion')

    expect(drain).toHaveBeenCalledTimes(1)
    const event = (drain.mock.calls[0]?.[0] as { event: { level: string } }).event
    expect(event.level).toBe('error')
  })

  it('skips the pipeline for excluded routes', async () => {
    const drain = vi.fn()
    const middleware = evlog({ drain, exclude: ['/health'] })
    const ctx = makeContext('GET', '/health')

    await middleware(ctx, async () => {})

    expect(drain).not.toHaveBeenCalled()
    expect(ctx.log).toBeUndefined()
  })
})
