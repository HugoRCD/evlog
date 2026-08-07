import { connectPhotonCredentials } from '@vercel/connect/eve'
import { photonIMessageChannel } from 'eve/channels/photon'

export default photonIMessageChannel({
  credentials: connectPhotonCredentials('photon/evi'),
})
