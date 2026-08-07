import { defineDynamic, defineInstructions } from 'eve/instructions'
import { channelName } from '../lib/channel'

const CHECKED_OUT = `## Workspace

The evlog repository is checked out at \`/workspace\`, at the ref of the thread you were summoned on. Read it with \`glob\`, \`grep\` and \`read_file\` rather than the GitHub API — it is free, it is the code under discussion, and \`grep\` takes real regular expressions. The checkout is shallow, so use \`github__getBlame\` for history.

Every path you pass to those tools must be absolute: \`grep "x" --glob "/workspace/packages/evlog/src/**"\`. A repo-relative path is rejected outright.`

const EMPTY = `## Workspace

\`/workspace\` is empty on this channel: there is no repository checkout, and \`glob\`, \`grep\` and \`read_file\` have nothing to find. Read repository files with \`github__searchCode\` and \`github__getFileContent\` instead.`

/** Only the GitHub channel checks the triggering ref out into the sandbox. */
export default defineDynamic({
  events: {
    'turn.started': (_event, ctx) =>
      defineInstructions({
        markdown: channelName(ctx.channel.kind) === 'github' ? CHECKED_OUT : EMPTY,
      }),
  },
})
