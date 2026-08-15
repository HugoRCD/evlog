import { defaultBackend, defineSandbox } from 'eve/sandbox'

/**
 * The workspace the content subagents share.
 *
 * A declared subagent inherits nothing from the root, sandbox included, and
 * eve prewarms one template per subagent at build time. Re-exporting the root
 * definition therefore built the root's template three times: clone, install,
 * the full lint, typecheck, and test run, Chromium, and the before-after CLI,
 * once for the root and once per content subagent. That tripled the deploy and
 * was the slowest way to find out that any of them can fail.
 *
 * These two read pages and write pages. They run no checks, drive no browser,
 * and capture nothing, so the template stops at a checkout with dependencies
 * installed. What they lose against the root template is the primed turbo
 * cache, which they never used: the pass runs its own verification in the root
 * session, after the rewrite comes back.
 */
export default defineSandbox({
  backend: defaultBackend({
    vercel: {
      resources: { vcpus: 2 },
      // One day is the platform floor: Vercel rejects anything between 0 and
      // 86400000 ms. It also matches the pass's cadence, so a snapshot lives
      // exactly as long as the gap between two runs.
      snapshotExpiration: 24 * 60 * 60 * 1000,
    },
  }),
  revalidationKey: () => 'evlog-content-workspace-v1',
  async bootstrap({ use }) {
    const sandbox = await use()
    await sandbox.run({ command: 'git clone --depth 50 https://github.com/HugoRCD/evlog.git repo' })
    await sandbox.run({ command: 'cd repo && corepack enable && corepack prepare --activate && pnpm install && pnpm run dev:prepare' })
    await sandbox.run({ command: 'git config --global user.name "evlogai[bot]" && git config --global user.email "evlogai[bot]@users.noreply.github.com"' })
  },
  async onSession({ use }) {
    const sandbox = await use()
    // The template snapshot is owned by the builder uid, not the session user;
    // without these entries every git command dies on "dubious ownership".
    await sandbox.run({ command: 'git config --global --add safe.directory /workspace && git config --global --add safe.directory /workspace/repo' })
    await sandbox.run({ command: 'cd repo && git fetch origin main && git checkout -B main origin/main' })
  },
})
