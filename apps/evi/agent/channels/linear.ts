import { connectLinearCredentials } from '@vercel/connect/eve'
import { linearChannel } from 'eve/channels/linear'

export default linearChannel({
  credentials: connectLinearCredentials('linear/evi'),
})
