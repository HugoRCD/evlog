import { defineErrorCatalog } from 'evlog'

/**
 * Typed error catalog for `@evlog/cli`.
 *
 * Wire codes are `cli.<KEY>` (e.g. `cli.EVLOG_NOT_FOUND`). Used when a
 * command aborts, and attached as `findings[].code` on `--debug` wide events
 * so a failed doctor check carries why / fix / link without throwing.
 */
export const cliErrors = defineErrorCatalog('cli', {
  NODE_TOO_OLD: {
    status: 400,
    message: ({ version, min }: { version: string, min: number }) =>
      `Node ${version} is too old (need >= ${min})`,
    why: 'The evlog CLI requires a modern Node runtime',
    fix: 'Upgrade Node to the latest LTS',
    link: 'https://nodejs.org/',
    tags: ['doctor', 'environment'],
  },
  PROJECT_NO_PACKAGE: {
    status: 404,
    message: 'No package.json found',
    why: 'Doctor needs a package root to diagnose the project',
    fix: 'Run from your app directory or pass --cwd',
    tags: ['doctor', 'project'],
  },
  EVLOG_NOT_FOUND: {
    status: 404,
    message: 'evlog is not installed in this project',
    why: 'No resolvable evlog package in node_modules and no declaration in package.json',
    fix: 'pnpm add evlog — see installation docs',
    link: 'https://evlog.dev/getting-started/installation',
    tags: ['doctor', 'evlog'],
  },
  EVLOG_DECLARED_NOT_INSTALLED: {
    status: 404,
    message: ({ range }: { range: string }) =>
      `evlog is declared (${range}) but not installed`,
    why: 'package.json lists evlog but node_modules resolve failed',
    fix: 'Run your package manager install step',
    tags: ['doctor', 'evlog'],
  },
  LOGS_SINK_MISSING: {
    status: 404,
    message: 'No local .evlog/logs sink yet',
    why: 'The fs drain has not written any local logs yet',
    fix: 'Enable the fs drain (evlog/fs); the sink is created on first write',
    tags: ['doctor', 'logs'],
  },
  COMMAND_FAILED: {
    status: 500,
    message: 'CLI command failed',
    why: 'An unexpected error aborted the command',
    fix: 'Re-run with --debug and share the wide event',
    tags: ['cli'],
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    cli: typeof cliErrors
  }
}
