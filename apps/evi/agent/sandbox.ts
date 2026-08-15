import { agentBrowserRevalidationKey, installAgentBrowser } from '@agent-browser/eve/sandbox'
import { defaultBackend, defineSandbox } from 'eve/sandbox'

/**
 * Kept for its diff engine (pixel and DOM comparison from existing images),
 * not for capture: capture__before_after owns capture and hosting. Pinned so
 * template reuse invalidates when it moves.
 */
const BEFORE_AFTER_CLI = '@vercel/before-and-after@0.0.4'

/**
 * The sandbox template carries a ready-to-work evlog checkout so sessions can
 * run lint, typecheck, and tests instead of shipping unverified changes.
 * Bootstrap is template-scoped: the clone and install are paid once per
 * template build, then every session inherits the filesystem and only pays a
 * fetch to move to the current main.
 */
export default defineSandbox({
  backend: defaultBackend({
    vercel: {
      resources: { vcpus: 4 },
      // One snapshot per sandbox keeps storage flat. The old 48h expiration
      // also killed the template snapshot after any quiet stretch, forcing a
      // full runtime rebuild that sessions queue behind.
      keepLastSnapshots: { count: 1, deleteEvicted: true },
      // Vercel removes unresumable sandboxes after 14 days anyway.
      snapshotExpiration: 14 * 24 * 60 * 60 * 1000,
    },
  }),
  revalidationKey: () => `evlog-workspace-v5:${agentBrowserRevalidationKey()}:${BEFORE_AFTER_CLI}`,
  async bootstrap({ use }) {
    const sandbox = await use()
    await sandbox.run({ command: 'git clone --depth 50 https://github.com/HugoRCD/evlog.git repo' })
    await sandbox.run({ command: 'cd repo && corepack enable && corepack prepare --activate && pnpm install && pnpm run dev:prepare' })
    // Prime the turbo cache so a session's checks only re-run what its diff
    // affects. Deployed builds only: locally this is minutes of CPU on every
    // template rebuild.
    if (process.env.VERCEL) {
      await sandbox.run({ command: 'cd repo && pnpm run lint && pnpm run typecheck && pnpm run test' })
    }
    // Commits authored in the sandbox belong to the bot, on every channel.
    await sandbox.run({ command: 'git config --global user.name "evlogai[bot]" && git config --global user.email "evlogai[bot]@users.noreply.github.com"' })
    // Browser tooling is template-scoped: Chromium is paid once per template
    // build, never per session.
    await installAgentBrowser(sandbox)
    await sandbox.run({ command: `npm install -g ${BEFORE_AFTER_CLI}` })
  },
  async onSession({ use }) {
    const sandbox = await use()
    // The template snapshot is owned by the builder uid, not the session user;
    // without these entries every git command, this fetch included, dies on
    // "dubious ownership" and the GitHub channel checkout fails silently.
    await sandbox.run({ command: 'git config --global --add safe.directory /workspace && git config --global --add safe.directory /workspace/repo' })
    await sandbox.run({ command: 'cd repo && git fetch origin main && git checkout -B main origin/main' })
  },
})
