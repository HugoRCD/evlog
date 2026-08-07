import { defineDynamic, defineInstructions } from 'eve/instructions'

// The GitHub channel checks the triggering ref out into /workspace before the
// first model call; no other channel does, and the local backend skips it even
// on GitHub. Without being told which case it is in, the model probes with a
// read_file that fails on every non-GitHub turn. One line of context is cheaper
// than that wasted call.
const CHECKED_OUT = `## Workspace

The evlog repository is checked out at \`/workspace\`, at the ref of the thread you were summoned on. Read it with \`glob\`, \`grep\` and \`read_file\` rather than the GitHub API — it is free, it is the code under discussion, and \`grep\` takes real regular expressions. The checkout is shallow, so use \`github__getBlame\` for history.

Every path you pass to those tools must be absolute. \`grep "x" --glob "/workspace/packages/evlog/src/**"\`, never a repo-relative path — they reject it outright.`

const EMPTY = `## Workspace

\`/workspace\` is empty on this channel: there is no repository checkout, and \`glob\`, \`grep\` and \`read_file\` have nothing to find. Do not reach for them to read repository files — use \`github__searchCode\` and \`github__getFileContent\` instead.`

export default defineDynamic({
  events: {
    'turn.started': (_event, ctx) =>
      defineInstructions({ markdown: ctx.channel.kind === 'github' ? CHECKED_OUT : EMPTY }),
  },
})
