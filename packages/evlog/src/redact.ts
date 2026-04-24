import type { RedactConfig } from './types'

const DEFAULT_REPLACEMENT = '[REDACTED]'

export type Masker = [RegExp, (match: string) => string]

/**
 * Built-in PII detection patterns with smart masking.
 * Each builtin preserves just enough signal for debugging while scrubbing PII.
 */
export const builtinPatterns = {
  /** Credit card numbers → ****1111 (PCI DSS: last 4 allowed) */
  creditCard: {
    pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    mask: (m: string) => `****${m.replace(/[\s-]/g, '').slice(-4)}`,
  },
  /** Email addresses → a***@***.com */
  email: {
    pattern: /[\w.+-]+@[\w-]+\.[\w.]+/g,
    mask: (m: string) => {
      const at = m.indexOf('@')
      if (at < 1) return '***@***'
      const tld = m.slice(m.lastIndexOf('.'))
      return `${m[0]}***@***${tld}`
    },
  },
  /** IPv4 addresses → ***.***.***.100 (last octet only) */
  ipv4: {
    pattern: /\b(?!0\.0\.0\.0\b)(?!127\.0\.0\.1\b)\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    mask: (m: string) => `***.***.***.${m.split('.').pop()}`,
  },
  /**
   * International phone numbers → `+33******78` (country code + last 2 digits).
   *
   * Requires an explicit phone signal (`+countryCode` prefix or `(areaCode)`
   * parens) to avoid false positives on digit-rich identifiers (UUIDs,
   * idempotency keys, order ids, hex hashes). Bare digit runs like `12345678`
   * are intentionally not matched — opt in via custom `patterns` if your app
   * stores phones in unformatted form.
   */
  phone: {
    pattern: /(?:\+\d{1,3}[\s.-]?\(?\d{1,4}\)?|\(\d{1,4}\))(?:[\s.-]?\d{2,4}){2,4}\b/g,
    mask: (m: string) => {
      const digits = m.replace(/[^\d]/g, '')
      const hasPlus = m.startsWith('+')
      if (hasPlus && digits.length > 4) {
        const ccMatch = m.match(/^\+\d{1,3}/)
        const cc = ccMatch ? ccMatch[0] : '+'
        return `${cc}******${digits.slice(-2)}`
      }
      if (digits.length > 2) {
        return `${'*'.repeat(digits.length - 2)}${digits.slice(-2)}`
      }
      return '***'
    },
  },
  /** JWT tokens → eyJ***.*** */
  jwt: {
    pattern: /\beyJ[\w-]*\.[\w-]*\.[\w-]*\b/g,
    mask: () => 'eyJ***.***',
  },
  /** Bearer tokens → Bearer *** */
  bearer: {
    pattern: /\bBearer\s+[\w\-.~+/]{8,}=*/gi,
    mask: () => 'Bearer ***',
  },
  /** IBAN → FR76****189 (country + check digits + last 3) */
  iban: {
    pattern: /\b[A-Z]{2}\d{2}[\s-]?[\dA-Z]{4}[\s-]?[\dA-Z]{4}[\s-]?[\dA-Z]{4}[\s-]?[\dA-Z]{0,4}[\s-]?[\dA-Z]{0,4}[\s-]?[\dA-Z]{0,4}\b/g,
    mask: (m: string) => {
      const clean = m.replace(/[\s-]/g, '')
      return `${clean.slice(0, 4)}****${clean.slice(-3)}`
    },
  },
} as const

export type BuiltinPatternName = keyof typeof builtinPatterns

/**
 * Resolve a `redact` option (boolean or object) into a concrete `RedactConfig`.
 *
 * - `true` → all built-in patterns with smart masking, no custom paths
 * - `{ ... }` → built-in maskers merged with user config (opt-out: `builtins: false`)
 * - `false` / `undefined` → `undefined` (no redaction)
 */
export function resolveRedactConfig(input: boolean | RedactConfig | undefined): RedactConfig | undefined {
  if (input === undefined || input === false) return undefined

  if (input === true) {
    return { _maskers: allBuiltinMaskers() }
  }

  if (input.builtins === false) {
    return input
  }

  const maskers = Array.isArray(input.builtins)
    ? input.builtins
      .map(name => builtinPatterns[name])
      .filter(Boolean)
      .map(b => [cloneRegex(b.pattern), b.mask] as Masker)
    : allBuiltinMaskers()

  return {
    ...input,
    _maskers: maskers,
  }
}

function allBuiltinMaskers(): Masker[] {
  return Object.values(builtinPatterns).map(b => [cloneRegex(b.pattern), b.mask] as Masker)
}

function cloneRegex(re: RegExp): RegExp {
  return new RegExp(re.source, re.flags)
}

/**
 * Redact sensitive data from a wide event in-place.
 *
 * Three strategies applied in order:
 * 1. **Path-based**: dot-notation paths — the leaf value is replaced with `replacement`.
 * 2. **Masker-based**: built-in patterns with smart partial masking (e.g. `****1111`).
 * 3. **Pattern-based**: custom RegExp patterns replaced with `replacement`.
 *
 * @param event - The wide event object (mutated in-place).
 * @param config - Redaction configuration.
 */
export function redactEvent(event: Record<string, unknown>, config: RedactConfig): void {
  const replacement = config.replacement ?? DEFAULT_REPLACEMENT

  if (config.paths?.length) {
    for (const path of config.paths) {
      redactPath(event, path.split('.'), replacement)
    }
  }

  if (config._maskers?.length) {
    applyMaskersToTree(event, config._maskers)
  }

  if (config.patterns?.length) {
    redactPatterns(event, config.patterns, replacement)
  }
}

function redactPath(obj: Record<string, unknown>, segments: string[], replacement: string): void {
  let current: unknown = obj
  for (let i = 0; i < segments.length - 1; i++) {
    if (current === null || current === undefined || typeof current !== 'object') return
    current = (current as Record<string, unknown>)[segments[i]!]
  }

  if (current === null || current === undefined || typeof current !== 'object') return

  const leaf = segments[segments.length - 1]!
  if (leaf in (current as Record<string, unknown>)) {
    (current as Record<string, unknown>)[leaf] = replacement
  }
}

function redactPatterns(obj: unknown, patterns: RegExp[], replacement: string): void {
  if (obj === null || obj === undefined) return

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      if (typeof obj[i] === 'string') {
        obj[i] = applyPatterns(obj[i] as string, patterns, replacement)
      } else if (typeof obj[i] === 'object') {
        redactPatterns(obj[i], patterns, replacement)
      }
    }
    return
  }

  if (typeof obj === 'object') {
    const record = obj as Record<string, unknown>
    for (const key in record) {
      const val = record[key]
      if (typeof val === 'string') {
        record[key] = applyPatterns(val, patterns, replacement)
      } else if (typeof val === 'object') {
        redactPatterns(val, patterns, replacement)
      }
    }
  }
}

function applyPatterns(value: string, patterns: RegExp[], replacement: string): string {
  let result = value
  for (const pattern of patterns) {
    pattern.lastIndex = 0
    result = result.replace(pattern, replacement)
  }
  return result
}

function applyMaskersToTree(obj: unknown, maskers: Masker[]): void {
  if (obj === null || obj === undefined) return

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      if (typeof obj[i] === 'string') {
        obj[i] = applyMaskers(obj[i] as string, maskers)
      } else if (typeof obj[i] === 'object') {
        applyMaskersToTree(obj[i], maskers)
      }
    }
    return
  }

  if (typeof obj === 'object') {
    const record = obj as Record<string, unknown>
    for (const key in record) {
      const val = record[key]
      if (typeof val === 'string') {
        record[key] = applyMaskers(val, maskers)
      } else if (typeof val === 'object') {
        applyMaskersToTree(val, maskers)
      }
    }
  }
}

function applyMaskers(value: string, maskers: Masker[]): string {
  let result = value
  for (const [pattern, mask] of maskers) {
    pattern.lastIndex = 0
    result = result.replace(pattern, mask)
  }
  return result
}

/**
 * Normalize a redact config that may have been deserialized from JSON
 * (e.g. via `process.env.__EVLOG_CONFIG`). Converts pattern strings
 * back to RegExp instances, then resolves built-in patterns.
 */
export function normalizeRedactConfig(raw: boolean | Record<string, unknown> | undefined): RedactConfig | undefined {
  if (raw === undefined || raw === false) return undefined
  if (raw === true) return resolveRedactConfig(true)

  const config: RedactConfig = {}

  if (Array.isArray(raw.paths)) {
    config.paths = raw.paths as string[]
  }

  if (typeof raw.replacement === 'string') {
    config.replacement = raw.replacement
  }

  if (raw.builtins === false) {
    config.builtins = false
  } else if (Array.isArray(raw.builtins)) {
    config.builtins = raw.builtins as BuiltinPatternName[]
  }

  if (Array.isArray(raw.patterns)) {
    config.patterns = (raw.patterns as unknown[]).map((p) => {
      if (p instanceof RegExp) return p
      if (typeof p === 'string') return new RegExp(p, 'g')
      if (typeof p === 'object' && p !== null) {
        const obj = p as Record<string, string>
        return new RegExp(obj.source, obj.flags ?? 'g')
      }
      return null
    }).filter((p): p is RegExp => p !== null)
  }

  return resolveRedactConfig(config)
}
