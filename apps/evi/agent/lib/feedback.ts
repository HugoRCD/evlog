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
