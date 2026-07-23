import { defineErrorCatalog } from 'evlog'

/**
 * Central catalog of this app's known server errors (self-documenting
 * `why`/`fix` context via evlog's `defineErrorCatalog`).
 *
 * Exported from `server/utils/`, so `telemetryErrors` is auto-imported as a
 * global across `server/**` — same mechanism as `useLogger`/`log`. Routes
 * call `telemetryErrors.SOME_CODE()` instead of `createError()`, which also
 * sidesteps the h3-vs-evlog `createError` auto-import ambiguity for these
 * call sites entirely.
 */
export const telemetryErrors = defineErrorCatalog('telemetry', {
  LOGIN_NOT_CONFIGURED: {
    status: 500,
    message: 'Dashboard login is not configured',
    why: 'ANALYTICS_PASSWORD is not set on the server',
    fix: 'Set ANALYTICS_PASSWORD in the deployment environment (see .env.example), or leave it unset to run without a login gate',
  },
  INVALID_PASSWORD: {
    status: 401,
    message: 'Invalid password',
  },
  RUN_NOT_FOUND: {
    status: 404,
    message: ({ id }: { id: number }) => `Run ${id} not found`,
    fix: 'Verify the run id from the runs list',
  },
  MCP_UNAUTHORIZED: {
    status: 403,
    message: 'Invalid or missing bearer token',
  },
})
