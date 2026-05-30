import { describe, expect, it } from 'vitest'
import { createRequestLogger } from 'evlog'
import { createOutboundHooks } from '../src/http'

describe('@evlog/cli/http', () => {
  it('records outbound request and response on the logger', async () => {
    const log = createRequestLogger({ method: 'CLI', path: '/sync' })
    const hooks = createOutboundHooks(log)

    await hooks.onRequest?.({
      request: '/users',
      options: { method: 'GET', baseURL: 'https://api.example.com' },
    })

    await hooks.onResponse?.({
      request: '/users',
      options: { method: 'GET', baseURL: 'https://api.example.com' },
      response: new Response('ok', { status: 200 }),
    })

    const ctx = log.getContext() as Record<string, unknown>
    expect(ctx.http).toEqual({
      outbound: {
        method: 'GET',
        url: 'https://api.example.com/users',
        status: 200,
      },
    })
  })
})
