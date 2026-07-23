import { describe, expect, it } from 'vitest'
import { verifyDashboardPassword } from '../server/utils/password'

describe('verifyDashboardPassword', () => {
  it('accepts a matching password', () => {
    expect(verifyDashboardPassword('correct-password', 'correct-password')).toBe(true)
  })

  it('rejects a mismatched password', () => {
    expect(verifyDashboardPassword('wrong-password', 'correct-password')).toBe(false)
  })

  it('rejects mismatched lengths without throwing', () => {
    expect(verifyDashboardPassword('short', 'much-longer-password')).toBe(false)
  })

  it('rejects empty candidate or expected values', () => {
    expect(verifyDashboardPassword('', 'correct-password')).toBe(false)
    expect(verifyDashboardPassword('correct-password', '')).toBe(false)
    expect(verifyDashboardPassword('', '')).toBe(false)
  })
})
