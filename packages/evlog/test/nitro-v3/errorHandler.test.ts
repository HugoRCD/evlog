import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetNitroDevOverlayCache } from '../../src/nitro'

vi.mock('nitro', () => ({
  defineErrorHandler: <T>(handler: T) => handler,
}))

import errorHandler from '../../src/nitro-v3/errorHandler'

describe('nitro-v3 errorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('__EVLOG_CONFIG', JSON.stringify({ pretty: true }))
    resetNitroDevOverlayCache()
  })

  it('calls defaultHandler when dev preset is nitro', async () => {
    vi.stubEnv('__EVLOG_CONFIG', JSON.stringify({ pretty: true, dev: 'nitro' }))
    resetNitroDevOverlayCache()
    const defaultHandler = vi.fn().mockResolvedValue(undefined)
    const error = new Error('boom')
    const event = { req: { url: 'http://localhost/api/test' } }

    await errorHandler(error, event, { defaultHandler })

    expect(defaultHandler).toHaveBeenCalledWith(error, event, { silent: false })
  })

  it('returns JSON for standard errors', async () => {
    const error = Object.assign(new Error('Something went wrong'), { statusCode: 400 })
    const response = await errorHandler(error, { req: { url: 'http://localhost/api/test' } })

    expect(response).toBeInstanceOf(Response)
    expect(response.status).toBe(400)
    const body = JSON.parse(await response.text())
    expect(body.message).toBe('Something went wrong')
  })
})
