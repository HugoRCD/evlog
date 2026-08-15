import type { MemorySource, Realm, SourceKind, Volatility } from '../../../db/schema'

export type { MemorySource, Realm, SourceKind, Volatility }

/**
 * The address of a set of memories. Every store method takes these; none
 * resolves one itself, so a caller cannot reach rows its session has no claim
 * to by forgetting an argument.
 */
export interface MemoryTarget {
  tenantId: string
  realm: Realm
  realmKey: string
}

export interface MemoryRecord extends MemoryTarget {
  id: string
  title: string
  text: string
  volatility: Volatility
  sourceKind: SourceKind
  source: MemorySource
  updatedAt: Date
}

export interface RememberInput extends MemoryTarget {
  text: string
  sourceKind: SourceKind
  source: MemorySource
  createdBy: string
  title?: string
  volatility?: Volatility
  validTo?: Date
  supersedes?: string
}

export interface MemoryStore {
  /** Upserts on (tenant, realm, key, hash): the same fact restated refreshes it. */
  remember(input: RememberInput): Promise<MemoryRecord>
  /** Live rows, most recently updated first. Invalidated and expired rows never appear. */
  list(targets: readonly MemoryTarget[], limit?: number): Promise<MemoryRecord[]>
  search(targets: readonly MemoryTarget[], query: string, limit?: number): Promise<MemoryRecord[]>
  /** Stamps `invalidatedAt`. The row stays: what Evi was told to drop is worth auditing. */
  forget(targets: readonly MemoryTarget[], id: string): Promise<boolean>
}

/** Longer than this is a document, and documents go to Linear. */
export const MAX_MEMORY_TEXT_LENGTH = 1_000
export const MAX_MEMORY_TITLE_LENGTH = 120
/** The core block's ceiling. It rides in the prefix on every turn of a session. */
export const CORE_BLOCK_CHAR_BUDGET = 1_600
export const DEFAULT_SEARCH_LIMIT = 8
