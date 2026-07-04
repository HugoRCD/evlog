import { eveChannel } from 'eve/channels/eve'
import { localDev, placeholderAuth, vercelOidc } from 'eve/channels/auth'

export default eveChannel({
  auth: [
    // Open on localhost for `eve dev` and the REPL; ignored in production.
    localDev(),
    // Lets the eve TUI and your Vercel deployments reach the deployed agent.
    vercelOidc(),
    // Placeholder for production browser auth — swap for Auth.js, Clerk, or none() before deploy.
    placeholderAuth(),
  ],
})
