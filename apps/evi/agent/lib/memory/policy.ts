import { createHash } from 'node:crypto'
import { MAX_MEMORY_TEXT_LENGTH, MAX_MEMORY_TITLE_LENGTH } from './types'

export class MemoryRejected extends Error {
  constructor(readonly reason: RejectionReason, message: string) {
    super(message)
  }
}

export type RejectionReason = 'empty' | 'too_long' | 'secret'

// A stored secret leaks into every later prompt, so these refuse outright.
const SECRET_PATTERNS: readonly RegExp[] = [
  /\bsk-[a-z0-9_-]{20,}\b/iu,
  /\bgh[pousr]_[a-z0-9]{30,}\b/iu,
  /\bvck?_[a-z0-9]{24,}\b/iu,
  /\bpostgres(?:ql)?:\/\/[^\s]*:[^\s]*@/iu,
  /\beyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\b/iu,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
]

export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/gu, ' ')
}

/** Lowercased so the same fact restated with different capitalization dedupes. */
export function contentHash(value: string): string {
  return createHash('sha256').update(normalizeText(value).toLowerCase()).digest('hex')
}

export interface AdmittedMemory {
  title: string
  text: string
  contentHash: string
}

/**
 * Deterministic, no model call. The memory-vs-repository judgement lives in
 * the tool description, where the model reads it.
 */
export function admit(input: { text: string, title?: string }): AdmittedMemory {
  const text = normalizeText(input.text)
  if (text.length === 0) throw new MemoryRejected('empty', 'A memory needs some text.')
  if (text.length > MAX_MEMORY_TEXT_LENGTH) {
    throw new MemoryRejected(
      'too_long',
      `Keep a memory to ${MAX_MEMORY_TEXT_LENGTH} characters; this one is ${text.length}. Anything longer is a document.`,
    )
  }

  const title = normalizeText(input.title ?? '').slice(0, MAX_MEMORY_TITLE_LENGTH)
  for (const candidate of [text, title]) {
    if (SECRET_PATTERNS.some(pattern => pattern.test(candidate))) {
      throw new MemoryRejected('secret', 'That looks like a credential. Refusing to store it.')
    }
  }

  return { title, text, contentHash: contentHash(text) }
}
