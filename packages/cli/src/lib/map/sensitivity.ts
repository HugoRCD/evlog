import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RawRouteEntry, Sensitivity } from './types'

const MONEY_IMPORTS = ['stripe', '@stripe/stripe-js', 'paddle-sdk', '@lemonsqueezy/lemonsqueezy.js']
const AUTH_IMPORTS = ['better-auth', 'next-auth', 'lucia', '@auth/core', '@auth/nextjs']
const MONEY_PATH = /checkout|payment|billing|invoice|refund|subscription/i
const AUTH_PATH = /auth|login|register|password|token|session/i
const PII_FIELDS = /email|phone|address|ssn|iban/i

/** Heuristic sensitivity classification (money / auth / PII) for a route. */
export function classifySensitivity(route: RawRouteEntry, projectRoot: string): Sensitivity {
  const reasons: string[] = []
  const filePath = join(projectRoot, route.file)
  let source = ''
  try {
    source = readFileSync(filePath, 'utf8')
  } catch {
    return { level: 'none', reasons: [] }
  }

  const lower = source.toLowerCase()
  const pathLower = route.path.toLowerCase()

  for (const pkg of MONEY_IMPORTS) {
    if (lower.includes(pkg)) {
      reasons.push(`money: imports ${pkg}`)
    }
  }
  if (MONEY_PATH.test(pathLower)) {
    reasons.push(`money: path matches ${route.path}`)
  }

  for (const pkg of AUTH_IMPORTS) {
    if (lower.includes(pkg)) {
      reasons.push(`auth: imports ${pkg}`)
    }
  }
  if (AUTH_PATH.test(pathLower)) {
    reasons.push(`auth: path matches ${route.path}`)
  }

  if (PII_FIELDS.test(source) && /\.(create|update|insert)\(/i.test(source)) {
    reasons.push('pii: write operation with sensitive fields')
  }

  const hasMoney = reasons.some(r => r.startsWith('money:'))
  const hasAuth = reasons.some(r => r.startsWith('auth:'))
  const hasPii = reasons.some(r => r.startsWith('pii:'))

  if (hasMoney || hasAuth) {
    return { level: 'high', reasons }
  }
  if (hasPii) {
    return { level: 'medium', reasons }
  }
  return { level: 'none', reasons: [] }
}

export function sensitivityBadge(sensitivity: Sensitivity): string {
  if (sensitivity.reasons.some(r => r.startsWith('money:'))) return '$'
  if (sensitivity.reasons.some(r => r.startsWith('auth:'))) return 'A'
  if (sensitivity.level === 'medium') return 'o'
  return ''
}

export function sensitivityLabel(sensitivity: Sensitivity): string {
  if (sensitivity.reasons.some(r => r.startsWith('money:'))) return 'money'
  if (sensitivity.reasons.some(r => r.startsWith('auth:'))) return 'auth'
  if (sensitivity.level === 'medium') return 'pii'
  return ''
}
