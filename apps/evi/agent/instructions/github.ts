import { defineDynamic, defineInstructions } from 'eve/instructions'
import { channelName } from '../lib/channel'

const GITHUB = `## GitHub

Your reply is the comment: the channel posts it verbatim on this thread when the turn finishes. Write one reply and stop. Do not call \`github__addIssueComment\` on this issue or pull request; that posts a second comment next to the one the channel already delivers. Use that tool only for a different thread. Progress on this channel is the eyes reaction on the mention, not a status comment.`

export default defineDynamic({
  events: {
    'turn.started': (_event, ctx) =>
      channelName(ctx.channel.kind) === 'github' ? defineInstructions({ content: GITHUB }) : null,
  },
})
