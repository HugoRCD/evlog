import { connectPhotonCredentials } from '@vercel/connect/eve'
import { photonIMessageChannel } from 'eve/channels/photon'

export default photonIMessageChannel({
  credentials: connectPhotonCredentials('photon/evi'),
  events: {
    async 'input.requested'(event, channel) {
      if (!channel.thread || event.requests.length === 0) return

      const body = event.requests
        .map((request) => {
          const options = request.options ?? []
          if (options.length === 0) return request.prompt
          const choices = options.map((option) => `· ${option.label} — reply "${option.id}"`)
          return [request.prompt, ...choices].join('\n')
        })
        .join('\n\n')

      await channel.thread.post(body)
    },
  },
})
