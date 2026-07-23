import { afterEach, describe, expect, it } from 'vitest'
import { isAuthEnabled, requireDashboardSession } from '../server/utils/session'

afterEach(() => {
  delete process.env.ANALYTICS_PASSWORD
})

describe('isAuthEnabled', () => {
  it('is disabled when ANALYTICS_PASSWORD is unset', () => {
    delete process.env.ANALYTICS_PASSWORD
    expect(isAuthEnabled()).toBe(false)
  })

  it('is enabled once ANALYTICS_PASSWORD is set', () => {
    process.env.ANALYTICS_PASSWORD = 'super-secret'
    expect(isAuthEnabled()).toBe(true)
  })
})

describe('requireDashboardSession', () => {
  it('is a no-op (never touches the event) when auth is disabled', async () => {
    delete process.env.ANALYTICS_PASSWORD
    // A real H3Event would throw immediately if `requireUserSession` (which
    // needs a full request/session context) were called on it — passing an
    // empty object proves the disabled path never reaches that call.
    await expect(requireDashboardSession({} as never)).resolves.toBeUndefined()
  })
})
