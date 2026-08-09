import { defaultBackend, defineSandbox } from 'eve/sandbox'

/**
 * The sandbox template carries a ready-to-work evlog checkout so sessions can
 * run lint, typecheck, and tests instead of shipping unverified changes.
 * Bootstrap is template-scoped: the clone and install are paid once per
 * template build, then every session inherits the filesystem and only pays a
 * fetch to move to the current main.
 */
export default defineSandbox({
  backend: defaultBackend({ vercel: { resources: { vcpus: 4 } } }),
  revalidationKey: () => 'evlog-workspace-v2',
  async bootstrap({ use }) {
    const sandbox = await use()
    await sandbox.run({ command: 'git clone --depth 50 https://github.com/HugoRCD/evlog.git repo' })
    await sandbox.run({ command: 'cd repo && corepack enable && corepack prepare --activate && pnpm install && pnpm run dev:prepare' })
    // Commits authored in the sandbox belong to the bot, on every channel.
    await sandbox.run({ command: 'git config --global user.name "evlogai[bot]" && git config --global user.email "evlogai[bot]@users.noreply.github.com"' })
  },
  async onSession({ use }) {
    const sandbox = await use()
    await sandbox.run({ command: 'cd repo && git fetch origin main && git checkout -B main origin/main' })
  },
})
