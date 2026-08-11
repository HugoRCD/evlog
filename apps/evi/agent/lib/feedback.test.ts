import { afterEach, describe, expect, it } from 'vitest'
import { captureReaction, feedbackStats, NO_DB_ERROR, saveFeedback, verdictFromReactionEmoji } from './feedback'

const NAMES = ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRESQL_URL'] as const

describe('verdictFromReactionEmoji', () => {
  it('maps positive reactions and their aliases', () => {
    for (const emoji of ['👍', '+1', 'thumbs_up', 'thumbsup', 'THUMBS-UP']) {
      expect(verdictFromReactionEmoji(emoji)).toBe('positive')
    }
  })

  it('maps negative reactions and their aliases', () => {
    for (const emoji of ['👎', '-1', 'thumbs_down', 'thumbsdown']) {
      expect(verdictFromReactionEmoji(emoji)).toBe('negative')
    }
  })

  it('ignores reactions that are not a thumb', () => {
    for (const emoji of ['❤️', '👀', '🚀', '', 'rocket', 'eyes']) {
      expect(verdictFromReactionEmoji(emoji)).toBeNull()
    }
  })
})

describe('captureReaction', () => {
  afterEach(() => {
    for (const name of NAMES) delete process.env[name]
  })

  it('returns null for a reaction that is not a thumb', async () => {
    for (const name of NAMES) delete process.env[name]
    expect(await captureReaction({ channel: 'imessage', emoji: '🚀', author: 'imessage:x', added: true })).toBeNull()
  })

  it('returns null for a removal so a capture source no-ops', async () => {
    for (const name of NAMES) delete process.env[name]
    expect(await captureReaction({ channel: 'imessage', emoji: '👍', author: 'imessage:x', added: false })).toBeNull()
  })

  it('records a verdict through saveFeedback when the emoji is a thumb', async () => {
    for (const name of NAMES) delete process.env[name]
    const result = await captureReaction({ channel: 'linear', emoji: 'thumbs_down', author: 'linear:user', added: true })
    expect(result).toEqual({ success: false, error: NO_DB_ERROR })
  })
})

describe('saveFeedback', () => {
  afterEach(() => {
    for (const name of NAMES) delete process.env[name]
  })

  it('degrades with an unavailable error when no database is configured', async () => {
    for (const name of NAMES) delete process.env[name]
    const result = await saveFeedback({
      channel: 'linear',
      verdict: 'negative',
      author: 'linear:user',
      source: 'reaction',
    })
    expect(result).toEqual({ success: false, error: NO_DB_ERROR })
  })
})

describe('feedbackStats', () => {
  afterEach(() => {
    for (const name of NAMES) delete process.env[name]
  })

  it('reports an empty store when no database is configured', async () => {
    for (const name of NAMES) delete process.env[name]
    const stats = await feedbackStats(new Date())
    expect(stats).toEqual({
      total: 0,
      positive: 0,
      negative: 0,
      reactions: 0,
      written: 0,
      byChannel: {},
      recentNegativeWritten: [],
    })
  })
})
