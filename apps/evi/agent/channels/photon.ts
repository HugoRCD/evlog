import { connectPhotonCredentials } from '@vercel/connect/eve'
import { photonIMessageChannel } from 'eve/channels/photon'

const MAX_VALUE_LENGTH = 160

function formatValue(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > MAX_VALUE_LENGTH ? `${flat.slice(0, MAX_VALUE_LENGTH)}…` : flat
}

export default photonIMessageChannel({
  credentials: connectPhotonCredentials('photon/evi'),
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
            lines.push('', ...options.map((option) => `· ${option.label} — reply "${option.id}"`))
          }

          return lines.join('\n')
        })
        .join('\n\n')

      await channel.thread.post(body)
    },
  },
})
