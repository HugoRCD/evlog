import { defineErrorCatalog } from 'evlog'

export const errorCatalog = defineErrorCatalog('demo', {
  CONFIG_MISSING: {
    status: 1,
    message: 'No demo.config.json found',
    fix: 'Run demo init or set DEMO_ENV=local',
  },
  AUTH_TOKEN_REQUIRED: {
    status: 1,
    message: 'API token required',
    fix: 'Pass --token or set DEMO_API_TOKEN',
  },
  CHECK_FAILED: {
    status: 2,
    message: 'One or more checks failed',
    fix: 'Run demo doctor --verbose for details',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    demo: typeof errorCatalog
  }
}
