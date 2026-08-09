import { connectPhotonCredentials } from '@vercel/connect/eve'
import { photonIMessageChannel } from 'eve/channels/photon'
import { MAINTAINER_PHONE } from '../lib/trust'

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
          }

          return lines.join('\n')
        })
        .join('\n\n')

      await channel.thread.post(body)
    },
    // A silent death reads as Evi ignoring Hugo; both terminal failures say so in the thread.
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
