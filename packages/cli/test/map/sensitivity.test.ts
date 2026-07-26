import { describe, expect, it } from 'vitest'
import { buildFileFacts } from '../../src/lib/map/facts'
import { parseSource } from '../../src/lib/map/parse'
import { classifySensitivity, sensitivityBadge, sensitivityLabel } from '../../src/lib/map/sensitivity'
import type { RawRouteEntry, Sensitivity } from '../../src/lib/map/types'

/**
 * Sensitivity is the gate on the `audit` rule and doubles a route's weight in
 * the global score, so a wrong verdict here costs more than a wrong rule: it
 * invents a 25-point requirement, or hides one, without any rule being at fault.
 * The false positives below are the ones that matter — `/api/authors` is not an
 * authentication endpoint.
 */
function classify(path: string, code = 'export default defineEventHandler(() => ({ ok: true }))'): Sensitivity {
  const parsed = parseSource('server/api/thing.post.ts', code)
  if (!parsed) throw new Error('fixture did not parse')

  const route: RawRouteEntry = {
    framework: 'nuxt',
    kind: 'api',
    method: 'POST',
    path,
    file: 'server/api/thing.post.ts',
    handler: { line: 1, column: 0 },
  }
  return classifySensitivity(route, buildFileFacts(parsed))
}

describe('sensitivity from the route path', () => {
  const money = ['/api/checkout', '/api/payments/stripe', '/api/billing/portal', '/api/invoices/:id', '/api/orders/:id/refund', '/api/subscriptions', '/api/payouts', '/api/refund-requests']
  const auth = ['/api/auth/login', '/api/oauth/callback', '/api/signup', '/api/password/reset', '/api/tokens', '/api/sessions', '/api/mfa/verify']
  /* Each of these contains a sensitive term as a substring of a longer word,
     which the previous substring matching could not tell apart. */
  const neutral = ['/api/authors', '/api/authors/:id/posts', '/api/health', '/api/blog/posts', '/api/tokenizer', '/api/sessionize', '/api/logistics']

  for (const path of money) {
    it(`flags ${path} as money`, () => {
      const sensitivity = classify(path)
      expect(sensitivity.level).toBe('high')
      expect(sensitivityLabel(sensitivity)).toBe('money')
      expect(sensitivityBadge(sensitivity)).toBe('$')
    })
  }

  for (const path of auth) {
    it(`flags ${path} as auth`, () => {
      const sensitivity = classify(path)
      expect(sensitivity.level).toBe('high')
      expect(sensitivityLabel(sensitivity)).toBe('auth')
      expect(sensitivityBadge(sensitivity)).toBe('A')
    })
  }

  for (const path of neutral) {
    it(`leaves ${path} alone`, () => {
      const sensitivity = classify(path)
      expect(sensitivity.level).toBe('none')
      expect(sensitivity.reasons).toEqual([])
    })
  }

  it('names the word it matched rather than echoing the path back', () => {
    expect(classify('/api/auth/login').reasons).toEqual(['auth: path says "auth"'])
    expect(classify('/api/orders/:id/refund').reasons).toEqual(['money: path says "refund"'])
  })
})

describe('sensitivity from the code', () => {
  it('flags a payment SDK import wherever the route lives', () => {
    const sensitivity = classify('/api/webhooks/incoming', 'import Stripe from \'stripe\'\nexport default defineEventHandler(() => new Stripe(\'k\'))')

    expect(sensitivity.level).toBe('high')
    expect(sensitivity.reasons).toContain('money: imports stripe')
  })

  it('flags an auth library through a subpath import', () => {
    const sensitivity = classify('/api/me', 'import { getSession } from \'better-auth/api\'\nexport default defineEventHandler(() => getSession())')

    expect(sensitivity.level).toBe('high')
    expect(sensitivity.reasons).toContain('auth: imports better-auth')
  })

  it('ignores a package named only in a comment', () => {
    const sensitivity = classify('/api/me', '// TODO: drop stripe once migrated\nexport default defineEventHandler(() => ({ ok: true }))')

    expect(sensitivity.level).toBe('none')
  })

  it('treats a write touching personal fields as medium, not high', () => {
    const sensitivity = classify('/api/profile', 'export default defineEventHandler(async () => db.update({ email: \'a@b.c\', phone: \'1\' }))')

    expect(sensitivity.level).toBe('medium')
    expect(sensitivityLabel(sensitivity)).toBe('pii')
    expect(sensitivity.reasons).toEqual(['pii: write operation with sensitive fields'])
  })

  it('does not flag personal fields that are only read', () => {
    const sensitivity = classify('/api/profile', 'export default defineEventHandler(async () => db.find({ email: \'a@b.c\' }))')

    expect(sensitivity.level).toBe('none')
  })

  it('reports every reason it found, not just the first', () => {
    const sensitivity = classify('/api/checkout', 'import Stripe from \'stripe\'\nexport default defineEventHandler(() => new Stripe(\'k\'))')

    expect(sensitivity.reasons).toEqual(['money: imports stripe', 'money: path says "checkout"'])
  })
})
