import { afterEach, describe, expect, it } from 'vitest'
import { NO_DB_ERROR, saveFeedback, verdictFromReactionEmoji } from './feedback'

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
