import type { RunEvent, RunOutcome } from './types'

export type { RunEvent, RunOutcome } from './types'

const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/
const DEFAULT_MAX_BODY_BYTES = 64 * 1024
const DEFAULT_MAX_BATCH_SIZE = 50
const DEFAULT_MAX_COMMAND_LENGTH = 256
const DEFAULT_MAX_DURATION_MS = 24 * 60 * 60 * 1000

/**
 * Server-side options for validating telemetry ingest POST bodies.
 * Mirror the CLI's `name` and declared `collect` allowlists on your API.
 */
export interface IngestValidatorOptions {
  /** Published tool names your endpoint accepts (e.g. `['my-tool']`). */
  allowedTools: readonly string[]
  /**
   * Custom keys allowed per tool — should match `collect.fields` plus any
   * `telemetry.set()` keys you document for that tool.
   */
  allowedCustomKeys?: Record<string, readonly string[]>
  /** Max UTF-8 body size in bytes. Default: 64 KiB. */
  maxBodyBytes?: number
  /** Max events per batch. Default: 50. */
  maxBatchSize?: number
  /** Max `command` string length. Default: 256. */
  maxCommandLength?: number
  /** Max plausible `durationMs` per run. Default: 24 hours. */
  maxDurationMs?: number
}

/** Thrown when an ingest body fails validation. */
export class IngestValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IngestValidationError'
  }
}

/**
 * Parse and validate a telemetry ingest POST body (`{ events: RunEvent[] }`).
 * Use in your API route before storing or forwarding events.
 *
 * @throws {@link IngestValidationError} when the payload is invalid or untrusted.
 */
export function parseIngestBody(raw: string, options: IngestValidatorOptions): RunEvent[] {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
  const maxBatchSize = options.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE

  if (new TextEncoder().encode(raw).byteLength > maxBodyBytes) {
    throw new IngestValidationError('payload too large')
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    throw new IngestValidationError('invalid json')
  }

  if (typeof body !== 'object' || body === null) {
    throw new IngestValidationError('invalid body')
  }

  const { events } = body as { events?: unknown }
  if (!Array.isArray(events) || events.length === 0 || events.length > maxBatchSize) {
    throw new IngestValidationError('invalid batch')
  }

  return events.map(event => validateRunEvent(event, options))
}

function validateRunEvent(input: unknown, options: IngestValidatorOptions): RunEvent {
  if (typeof input !== 'object' || input === null) {
    throw new IngestValidationError('invalid event')
  }

  const e = input as RunEvent

  if (e.event !== 'run') throw new IngestValidationError('invalid event type')

  const toolName = e.tool?.name
  if (typeof toolName !== 'string' || !options.allowedTools.includes(toolName)) {
    throw new IngestValidationError('unknown tool')
  }

  if (typeof e.tool.version !== 'string' || !e.tool.version.trim()) {
    throw new IngestValidationError('invalid tool version')
  }

  const maxCommandLength = options.maxCommandLength ?? DEFAULT_MAX_COMMAND_LENGTH
  if (typeof e.command !== 'string' || !e.command.trim() || e.command.length > maxCommandLength) {
    throw new IngestValidationError('invalid command')
  }

  const maxDurationMs = options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS
  if (typeof e.durationMs !== 'number' || !Number.isFinite(e.durationMs) || e.durationMs < 0 || e.durationMs > maxDurationMs) {
    throw new IngestValidationError('invalid duration')
  }

  if (!isRunOutcome(e.outcome)) throw new IngestValidationError('invalid outcome')

  if (typeof e.idempotencyKey !== 'string' || !e.idempotencyKey.trim()) {
    throw new IngestValidationError('missing idempotency key')
  }

  if (typeof e.timestamp !== 'string' || !isValidIsoTimestamp(e.timestamp)) {
    throw new IngestValidationError('invalid timestamp')
  }

  if (e.errorCode !== undefined && (typeof e.errorCode !== 'string' || !e.errorCode.trim())) {
    throw new IngestValidationError('invalid error code')
  }

  const flags = sanitizeRecord(e.flags, 'flags')
  const env = validateEnv(e.env)
  const custom = filterCustom(e.custom, toolName, options.allowedCustomKeys)

  return {
    event: 'run',
    command: e.command,
    durationMs: e.durationMs,
    outcome: e.outcome,
    errorCode: e.errorCode,
    flags,
    tool: { name: toolName, version: e.tool.version },
    env,
    machineId: typeof e.machineId === 'string' && e.machineId.trim() ? e.machineId : undefined,
    custom,
    idempotencyKey: e.idempotencyKey,
    timestamp: e.timestamp,
  }
}

function isRunOutcome(value: unknown): value is RunOutcome {
  return value === 'success' || value === 'error'
}

function isValidIsoTimestamp(value: string): boolean {
  if (!ISO_8601_REGEX.test(value)) return false
  return !Number.isNaN(new Date(value).getTime())
}

function sanitizeRecord(
  input: unknown,
  label: string,
): Record<string, boolean | number | string> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new IngestValidationError(`invalid ${label}`)
  }

  const out: Record<string, boolean | number | string> = {}
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
      out[key] = value
    }
  }
  return out
}

function validateEnv(input: unknown): RunEvent['env'] {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new IngestValidationError('invalid env')
  }

  const env = input as RunEvent['env']
  if (typeof env.node !== 'string' || !env.node.trim()) {
    throw new IngestValidationError('invalid env.node')
  }
  if (typeof env.ci !== 'boolean') throw new IngestValidationError('invalid env.ci')
  if (env.provider !== null && typeof env.provider !== 'string') {
    throw new IngestValidationError('invalid env.provider')
  }
  if (typeof env.tty !== 'boolean') throw new IngestValidationError('invalid env.tty')
  if (env.agent !== null && typeof env.agent !== 'string') {
    throw new IngestValidationError('invalid env.agent')
  }
  if (typeof env.environment !== 'string' || !env.environment.trim()) {
    throw new IngestValidationError('invalid env.environment')
  }

  return {
    node: env.node,
    ci: env.ci,
    provider: env.provider,
    tty: env.tty,
    agent: env.agent,
    environment: env.environment.trim(),
  }
}

function filterCustom(
  input: unknown,
  toolName: string,
  allowedCustomKeys?: Record<string, readonly string[]>,
): Record<string, boolean | number | string> {
  const allowed = new Set(allowedCustomKeys?.[toolName] ?? [])
  const raw = sanitizeRecord(input ?? {}, 'custom')
  if (allowed.size === 0) return {}

  const out: Record<string, boolean | number | string> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (allowed.has(key)) out[key] = value
  }
  return out
}
