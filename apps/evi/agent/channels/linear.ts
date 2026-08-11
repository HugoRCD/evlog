import { connectLinearCredentials } from '@vercel/connect/eve'
import { linearChannel } from 'eve/channels/linear'
import { saveFeedback, verdictFromReactionEmoji } from '../lib/feedback'

export default linearChannel({
  credentials: connectLinearCredentials('linear/evi'),
  // A thumbs up/down reaction on a comment becomes a verdict on that message.
  // Only fires when the Linear webhook subscription for this app includes the
  // CommentReaction type; when it does not, no reaction webhooks arrive and
  // this handler is a silent no-op, so the channel keeps working either way.
  onDataWebhook: async (event) => {
    if (event.type !== 'CommentReaction' || event.action !== 'create') return
    const data = (event.raw?.data ?? event.raw) as Record<string, unknown> | undefined
    const emoji = typeof data?.reactionEmoji === 'string'
      ? data.reactionEmoji
      : typeof data?.emoji === 'string'
        ? data.emoji
        : ''
    const verdict = emoji === '' ? null : verdictFromReactionEmoji(emoji)
    if (!verdict) return

    const commentId = typeof data?.commentId === 'string' ? data.commentId : undefined
    const userId = typeof data?.userId === 'string' ? data.userId : undefined
    await saveFeedback({
      channel: 'linear',
      verdict,
      author: userId ?? 'linear:unknown',
      source: 'reaction',
      messageRef: commentId,
    })
  },
})
