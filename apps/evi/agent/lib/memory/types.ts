import type { MemorySource, Realm, SourceKind, Volatility } from '../../../db/schema'

export type { MemorySource, Realm, SourceKind, Volatility }

/** Every store method takes targets; none resolves its own, so a forgotten argument cannot widen a query. */
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
  invalidatedAt: Date | null
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
  /** Includes invalidated rows: search is the historical surface, `list` the current one. */
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
