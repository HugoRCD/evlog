import { desc, gt } from 'drizzle-orm'
import { feedback } from '../../db/schema'
import { getDb, isDbConfigured } from './db'

export type FeedbackVerdict = 'positive' | 'negative'
export type FeedbackSource = 'reaction' | 'written'

export interface SaveFeedbackInput {
  channel: string
  verdict: FeedbackVerdict
  author: string
  source: FeedbackSource
  text?: string
  messageRef?: string
  threadRef?: string
  sessionRef?: string
}

export type SaveFeedbackResult =
  | { success: true; id: string }
  | { success: false; error: string }

/** Shown to a caller when the store is absent; local runs without the DB keep working. */
export const NO_DB_ERROR = 'The feedback store is not configured in this environment.'

const POSITIVE_REACTIONS = new Set(['👍', '+1', 'thumbs_up', 'thumbsup', 'thumbs-up'])
const NEGATIVE_REACTIONS = new Set(['👎', '-1', 'thumbs_down', 'thumbsdown', 'thumbs-down'])

/**
 * Maps a reaction emoji (or its common shortcode aliases) to a binary verdict.
 * Returns null for anything that is neither a thumb up nor a thumb down, so
 * unrelated reactions (hearts, eyes, ...) are ignored by the capture.
 */
export function verdictFromReactionEmoji(emoji: string): FeedbackVerdict | null {
  const normalized = emoji.trim().toLowerCase()
  if (POSITIVE_REACTIONS.has(normalized)) return 'positive'
  if (NEGATIVE_REACTIONS.has(normalized)) return 'negative'
  return null
}

/**
 * Shared entry point for every reaction path (iMessage tapback, Linear webhook,
 * future GitHub). Maps the emoji to a verdict and records it. Returns null when
 * the emoji is not a thumb or when the event is a removal, so a capture source
 * treats "nothing to store" as a no-op rather than an error.
 */
export async function captureReaction(
  input: Omit<SaveFeedbackInput, 'verdict' | 'source'> & { emoji: string; added?: boolean },
): Promise<SaveFeedbackResult | null> {
  if (input.added === false) return null
  const verdict = verdictFromReactionEmoji(input.emoji)
  if (!verdict) return null
  return await saveFeedback({ ...input, verdict, source: 'reaction' })
}

/**
 * Persists one feedback row. Returns an unavailable error when no database is
 * configured rather than throwing, mirroring the `isDbConfigured()` guard the
 * rest of the agent uses so a feature degrades instead of crashing.
 */
export async function saveFeedback(input: SaveFeedbackInput): Promise<SaveFeedbackResult> {
  if (!isDbConfigured()) return { success: false, error: NO_DB_ERROR }
  const db = getDb()
  if (!db) return { success: false, error: NO_DB_ERROR }
  try {
    const rows = await db
      .insert(feedback)
      .values({
        channel: input.channel,
        verdict: input.verdict,
        author: input.author,
        source: input.source,
        text: input.text ?? null,
        messageRef: input.messageRef ?? null,
        threadRef: input.threadRef ?? null,
        sessionRef: input.sessionRef ?? null,
      })
      .returning({ id: feedback.id })
    return { success: true, id: rows[0]?.id ?? '' }
  } catch (error) {
    console.error('[evi:feedback] failed to save feedback', error)
    return { success: false, error: 'Feedback could not be stored.' }
  }
}

/** A stored feedback row as read back from the store. */
export interface FeedbackRow {
  id: string
  channel: string
  source: string
  verdict: string
  author: string
  text: string | null
  messageRef: string | null
  threadRef: string | null
  sessionRef: string | null
  createdAt: Date
}

/**
 * Rows created since `since`, newest first. Degrades to an empty list when the
 * store is not configured, so callers (stats, the weekly review) treat a
 * missing DB the same as "no feedback yet".
 */
export async function listFeedbackSince(since: Date): Promise<FeedbackRow[]> {
  if (!isDbConfigured()) return []
  const db = getDb()
  if (!db) return []
  return await db
    .select()
    .from(feedback)
    .where(gt(feedback.createdAt, since))
    .orderBy(desc(feedback.createdAt))
}

/** Aggregates over the rows captured since `since`, for the admin stats tool. */
export interface FeedbackStats {
  total: number
  positive: number
  negative: number
  reactions: number
  written: number
  byChannel: Record<string, number>
  /** The most recent written negative feedback with reasons, for the weekly review. */
  recentNegativeWritten: {
    id: string
    channel: string
    text: string
    createdAt: Date
    messageRef: string | null
  }[]
}

const RECENT_NEGATIVE_LIMIT = 10

export async function feedbackStats(since: Date): Promise<FeedbackStats> {
  const rows = await listFeedbackSince(since)
  const byChannel: Record<string, number> = {}
  let positive = 0
  let negative = 0
  let reactions = 0
  let written = 0
  const recentNegativeWritten: FeedbackStats['recentNegativeWritten'] = []

  for (const row of rows) {
    byChannel[row.channel] = (byChannel[row.channel] ?? 0) + 1
    if (row.verdict === 'positive') positive += 1
    else negative += 1
    if (row.source === 'reaction') reactions += 1
    else written += 1
    if (row.source === 'written' && row.verdict === 'negative' && row.text && recentNegativeWritten.length < RECENT_NEGATIVE_LIMIT) {
      recentNegativeWritten.push({ id: row.id, channel: row.channel, text: row.text, createdAt: row.createdAt, messageRef: row.messageRef })
    }
  }

  return { total: rows.length, positive, negative, reactions, written, byChannel, recentNegativeWritten }
}
