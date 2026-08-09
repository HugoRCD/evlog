import { defineDynamic, defineInstructions } from 'eve/instructions'
import { channelName } from '../lib/channel'

const RUN_BEFORE_ASSERT = `**Run before you assert.** Any claim about how the code behaves — "this is the bug", "this snippet works", "the test covers it" — is executed in \`/workspace/repo\` with \`bash\` before you state it. A fix you propose has its checks run there first. If you could not run it, present it as unverified.

\`/workspace/repo\` starts on the current \`main\`, so that is the revision your run verified. When the claim is about the thread's own revision and it differs from \`main\`, check it out there first (\`git fetch origin <sha> && git checkout --detach <sha>\`, then back to \`main\` when done) or say explicitly that the result was verified on \`main\`.`

const CHECKED_OUT = `## Workspace

Two checkouts are live in the sandbox:

- \`/workspace\` — the evlog repository at the ref of the thread you were summoned on. Read it with \`glob\`, \`grep\` and \`read_file\` rather than the GitHub API: it is free, it is the code under discussion, and \`grep\` takes real regular expressions. The checkout is shallow, so use \`github__getBlame\` for history.
- \`/workspace/repo\` — a working copy on the current \`main\`, dependencies installed and \`dev:prepare\` run. Everything executes here: repros, checks, and the shipping flow from the \`contributing\` skill.

Every path you pass to the file tools must be absolute: \`grep "x" --glob "/workspace/packages/evlog/src/**"\`. A repo-relative path is rejected outright.

${RUN_BEFORE_ASSERT}`

const NO_THREAD_CHECKOUT = `## Workspace

There is no thread checkout on this channel, but the sandbox carries the evlog repository at \`/workspace/repo\`: a working copy on the current \`main\`, dependencies installed and \`dev:prepare\` run. Read it with \`glob\`, \`grep\` and \`read_file\` (absolute paths only), execute repros and checks there with \`bash\`, and reach for \`github__searchCode\` / \`github__getFileContent\` only when you need a ref other than \`main\`.

${RUN_BEFORE_ASSERT}`

/** Only the GitHub channel checks the triggering ref out into `/workspace` itself. */
export default defineDynamic({
  events: {
    'turn.started': (_event, ctx) =>
      defineInstructions({
        markdown: channelName(ctx.channel.kind) === 'github' ? CHECKED_OUT : NO_THREAD_CHECKOUT,
      }),
  },
})
