import { connectPhotonCredentials } from '@vercel/connect/eve'
import { photonIMessageChannel } from 'eve/channels/photon'
import { captureReaction } from '../lib/feedback'
import { MAINTAINER_PHONE } from '../lib/trust'

/**
 * The inbound reaction (tapback) the repo's eve patch bridges out of the
 * Chat SDK. Kept local so the patch does not have to widen the package's
 * public index.
 */
interface PhotonReactionEvent {
  emoji: string
  rawEmoji?: string
  added: boolean
  messageId: string
  threadId: string
  userName: string
}

const MAX_VALUE_LENGTH = 160

function formatValue(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > MAX_VALUE_LENGTH ? `${flat.slice(0, MAX_VALUE_LENGTH)}…` : flat
}

export default photonIMessageChannel({
  credentials: connectPhotonCredentials('photon/evi'),
  // The Photon project's user allowlist only registers Hugo, so every inbound
  // message is his. Revisit when more users are added there.
  onMessage(_ctx, message) {
    if (message.author.isBot || MAINTAINER_PHONE === undefined) return null
    return {
      auth: {
        attributes: {},
        authenticator: 'photon-imessage',
        principalId: `imessage:${MAINTAINER_PHONE}`,
        principalType: 'user',
      },
    }
  },
  // A thumbs up/down tapback on an iMessage becomes a verdict on that message.
  onReaction: async (reaction: PhotonReactionEvent) => {
    await captureReaction({
      channel: 'imessage',
      emoji: reaction.emoji,
      author: reaction.userName || 'imessage:unknown',
      added: reaction.added,
      messageRef: reaction.messageId,
      threadRef: reaction.threadId,
    })
  },
  events: {
    async 'input.requested'(event, channel) {
      if (!channel.thread || event.requests.length === 0) return

      const body = event.requests
        .map((request) => {
          const lines = [request.prompt]

          if (request.kind === 'tool-approval') {
            for (const [key, value] of Object.entries(request.action.input)) {
              if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) continue
              lines.push(`${key}: ${formatValue(value)}`)
            }
          }

          const options = request.options ?? []
          if (options.length > 0) {
            lines.push('', ...options.map((option) => `· ${option.label}: reply "${option.id}"`))
            lines.push('Or answer in your own words.')
          }

          return lines.join('\n')
        })
        .join('\n\n')

      await channel.thread.post(body)
    },
    // A terminal failure is always reported in the thread; a failed turn never ends silent.
    async 'turn.failed'(event, channel) {
      if (!channel.thread) return
      await channel.thread.post(failureText('That turn failed', 'Send the message again to retry.', event))
    },
    async 'session.failed'(event, channel) {
      if (!channel.thread) return
      await channel.thread.post(failureText('This session could not recover', 'Send a new message to start over.', event))
    },
  },
})

function failureText(lead: string, guidance: string, event: { code?: string, message?: string }) {
  const hint = event.message ? ` (${formatValue(event.message)})` : ''
  const code = event.code ? ` [${event.code}]` : ''
  return `${lead}${hint}${code}. ${guidance}`
}
