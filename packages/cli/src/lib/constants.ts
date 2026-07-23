import { version as pkgVersion } from '../../package.json'

/** Telemetry tool name — user-facing in disclosure and consent strings. */
export const TOOL_NAME = 'evlog-cli'

/** Package version — shared by the main meta and command headers. */
export const VERSION = pkgVersion

/**
 * Default telemetry ingestion endpoint — evlog's own dashboard (`apps/telemetry`).
 * Overridable via `EVLOG_TELEMETRY_ENDPOINT` (see `resolveEndpoint()` in `@evlog/telemetry`).
 * Still gated by consent (`DO_NOT_TRACK`, `EVLOG_TELEMETRY=0`, `telemetry disable`).
 */
export const TELEMETRY_ENDPOINT = 'https://telemetry.evlog.cloud/api/telemetry/ingest'
