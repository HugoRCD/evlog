import type { FileFacts } from './facts'
import type { RawRouteEntry, Sensitivity } from './types'

const MONEY_IMPORTS = ['stripe', '@stripe/stripe-js', 'paddle-sdk', '@lemonsqueezy/lemonsqueezy.js']
const AUTH_IMPORTS = ['better-auth', 'next-auth', 'lucia', '@auth/core', '@auth/nextjs']

const MONEY_TERMS = ['checkout', 'payment', 'billing', 'invoice', 'refund', 'subscription', 'charge', 'payout']
const AUTH_TERMS = ['auth', 'oauth', 'login', 'logout', 'signin', 'signup', 'register', 'password', 'token', 'session', 'mfa', 'otp']

/**
 * Match a term as a whole word in a route path, allowing a plural.
 *
 * Anchoring matters more than it looks: the previous patterns were plain
 * substrings, so `/api/authors` was classified as authentication and `/api/blog`
 * escaped only by luck. A route wrongly marked sensitive is handed a 25-point
 * audit requirement it has no reason to satisfy, and counts double in the global
 * score — the fastest way to make the whole number untrustworthy.
 */
function matchTerm(path: string, terms: readonly string[]): string | null {
  for (const term of terms) {
    if (new RegExp(`(?:^|[^a-z0-9])${term}s?(?:[^a-z0-9]|$)`, 'i').test(path)) return term
  }
  return null
}

const PII_FIELDS = /email|phone|address|ssn|iban/i
const WRITE_CALLS = ['create', 'update', 'insert', 'upsert']

/** Whether a package is imported, allowing for subpath imports. */
function importsPackage(facts: FileFacts, pkg: string): boolean {
  for (const source of facts.imports.values()) {
    if (source === pkg || source.startsWith(`${pkg}/`)) return true
  }
  return false
}

/**
 * Sensitivity classification (money / auth / PII) for one entry point.
 *
 * Reads resolved imports and the identifiers actually present in the AST rather
 * than searching the raw source text. Substring matching on source could not
 * tell an import apart from a comment, so a `// TODO: drop stripe` was enough
 * to mark a route as handling money.
 */
export function classifySensitivity(route: RawRouteEntry, facts: FileFacts): Sensitivity {
  const reasons: string[] = []
  const path = route.path.toLowerCase()

  for (const pkg of MONEY_IMPORTS) {
    if (importsPackage(facts, pkg)) reasons.push(`money: imports ${pkg}`)
  }
  const moneyTerm = matchTerm(path, MONEY_TERMS)
  if (moneyTerm) reasons.push(`money: path says "${moneyTerm}"`)

  for (const pkg of AUTH_IMPORTS) {
    if (importsPackage(facts, pkg)) reasons.push(`auth: imports ${pkg}`)
  }
  const authTerm = matchTerm(path, AUTH_TERMS)
  if (authTerm) reasons.push(`auth: path says "${authTerm}"`)

  const touchesPii = [...facts.names].some(name => PII_FIELDS.test(name))
  const writes = facts.calls.some(call => WRITE_CALLS.includes(call.member.toLowerCase()))
  if (touchesPii && writes) {
    reasons.push('pii: write operation with sensitive fields')
  }

  const hasMoney = reasons.some(reason => reason.startsWith('money:'))
  const hasAuth = reasons.some(reason => reason.startsWith('auth:'))
  const hasPii = reasons.some(reason => reason.startsWith('pii:'))

  if (hasMoney || hasAuth) return { level: 'high', reasons }
  if (hasPii) return { level: 'medium', reasons }
  return { level: 'none', reasons: [] }
}

export function sensitivityBadge(sensitivity: Sensitivity): string {
  if (sensitivity.reasons.some(reason => reason.startsWith('money:'))) return '$'
  if (sensitivity.reasons.some(reason => reason.startsWith('auth:'))) return 'A'
  if (sensitivity.level === 'medium') return 'o'
  return ''
}

export function sensitivityLabel(sensitivity: Sensitivity): string {
  if (sensitivity.reasons.some(reason => reason.startsWith('money:'))) return 'money'
  if (sensitivity.reasons.some(reason => reason.startsWith('auth:'))) return 'auth'
  if (sensitivity.level === 'medium') return 'pii'
  return ''
}
