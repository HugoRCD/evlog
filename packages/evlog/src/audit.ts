import type { AuditActor, AuditFields, AuditTarget, DrainContext, EnrichContext, FieldContext, RedactConfig, RequestLogger, WideEvent } from './types'
import { createLogger } from './logger'
import { getHeader as getSharedHeader } from './shared/headers'

/**
 * Current version of the audit envelope. Bumped when `AuditFields` evolves
 * in a backward-incompatible way so downstream pipelines can branch on it.
 */
export const AUDIT_SCHEMA_VERSION = 1

/**
 * Input accepted by `log.audit()`, `audit()`, and `withAudit()`.
 *
 * `outcome` defaults to `'success'`. Internal fields populated by the audit
 * pipeline (`idempotencyKey`, `context`, `signature`, `prevHash`, `hash`) are
 * stripped — pass them through `log.set({ audit })` if you really need to.
 */
export interface AuditInput {
  action: string
  actor: AuditActor
  target?: AuditTarget
  outcome?: AuditFields['outcome']
  reason?: string
  changes?: AuditFields['changes']
  causationId?: string
  correlationId?: string
  version?: number
}

/**
 * @internal Stable JSON stringification with deterministic key order.
 * Used by `idempotencyKey` and `hash-chain` so the same logical event always
 * produces the same digest, regardless of how object keys were added.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`
}

/**
 * @internal Sync, isomorphic 32-bit FNV-1a. Used to derive the idempotency
 * key without pulling `node:crypto` into the static import graph (which would
 * break browser / Cloudflare Workers bundles that import `evlog` for types
 * or shared utilities). Idempotency keys are dedup tokens, not security
 * primitives — collision resistance at 128 bits is more than sufficient.
 */
function fnv1a32(input: string, seed: number): number {
  let h = seed >>> 0
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i) & 0xff
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/**
 * @internal Compute the deterministic idempotency key for an audit event.
 * Includes `action`, `actor.{type,id}`, `target.{type,id}`, `outcome`, and
 * `timestamp` rounded to the second so retries within the same second collapse.
 *
 * Uses four interleaved FNV-1a 32-bit hashes (128-bit output, 32 hex chars)
 * so the implementation stays sync and isomorphic across Node, browsers,
 * Bun, Deno, and Cloudflare Workers.
 */
function computeIdempotencyKey(audit: AuditFields, timestamp: string): string {
  const seconds = timestamp.slice(0, 19)
  const payload = stableStringify({
    action: audit.action,
    actor: { type: audit.actor.type, id: audit.actor.id },
    target: audit.target ? { type: audit.target.type, id: audit.target.id } : undefined,
    outcome: audit.outcome,
    timestamp: seconds,
  })
  const a = fnv1a32(payload, 0x811c9dc5).toString(16).padStart(8, '0')
  const b = fnv1a32(payload, 0xdeadbeef).toString(16).padStart(8, '0')
  const c = fnv1a32(payload, 0x1f83d9ab).toString(16).padStart(8, '0')
  const d = fnv1a32(payload, 0x5be0cd19).toString(16).padStart(8, '0')
  return a + b + c + d
}

/**
 * Build a normalised {@link AuditFields} from caller input. Defaults:
 * - `outcome` → `'success'`
 * - `version` → {@link AUDIT_SCHEMA_VERSION}
 *
 * `idempotencyKey` is filled at emit time with the event timestamp so retries
 * stay deterministic.
 */
export function buildAuditFields(input: AuditInput): AuditFields {
  return {
    action: input.action,
    actor: input.actor,
    target: input.target,
    outcome: input.outcome ?? 'success',
    reason: input.reason,
    changes: input.changes,
    causationId: input.causationId,
    correlationId: input.correlationId,
    version: input.version ?? AUDIT_SCHEMA_VERSION,
  }
}

/**
 * @internal Test-collector hook installed by {@link mockAudit}. When set, every
 * audit event flowing through `log.audit()` / `audit()` is also pushed to it.
 */
let _testCollector: ((event: AuditFields, wide: WideEvent | null) => void) | null = null

/** @internal Emit-time decoration: assign timestamp-based idempotency key. */
function decorateAudit(audit: AuditFields, timestamp: string): AuditFields {
  if (audit.idempotencyKey) return audit
  return { ...audit, idempotencyKey: computeIdempotencyKey(audit, timestamp) }
}

/**
 * Add audit semantics to an existing {@link RequestLogger}.
 *
 * Mutates the logger in place by adding an `audit` method (with a `.deny()`
 * sub-method). Strictly equivalent to calling `log.set({ audit: ... })` plus
 * `_forceKeep` on emit. Idempotent: calling twice on the same logger only
 * attaches the methods once.
 *
 * @example
 * ```ts
 * const log = withAuditMethods(createLogger())
 * log.audit({
 *   action: 'invoice.refund',
 *   actor: { type: 'user', id: user.id },
 *   target: { type: 'invoice', id: 'inv_889' },
 * })
 * ```
 */
export function withAuditMethods<T extends object = Record<string, unknown>>(logger: RequestLogger<T>): AuditableLogger<T> {
  const target = logger as AuditableLogger<T>
  if (target.audit) return target

  const audit = function audit(input: AuditInput): void {
    const fields = buildAuditFields(input)
    target.set({ audit: fields } as unknown as FieldContext<T>)
    markForceKeep(target)
  } as AuditMethod<T>

  audit.deny = function deny(reason: string, input: Omit<AuditInput, 'outcome' | 'reason'>): void {
    audit({ ...input, outcome: 'denied', reason })
  }

  target.audit = audit
  return target
}

/**
 * @internal Mark a logger so its next `emit()` is force-kept past tail sampling.
 * Implemented by stamping a hidden flag on the accumulated context which
 * `emit()` reads via `_forceKeep`.
 */
function markForceKeep<T extends object>(logger: RequestLogger<T>): void {
  const ctx = logger.getContext() as Record<string, unknown>
  ctx._auditForceKeep = true
}

/**
 * Logger augmented with `.audit()` / `.audit.deny()` helpers.
 */
export type AuditableLogger<T extends object = Record<string, unknown>> = RequestLogger<T> & { audit: AuditMethod<T> }

/** Method shape attached to {@link AuditableLogger}. */
export interface AuditMethod<T extends object = Record<string, unknown>> {
  (input: AuditInput): void
  /**
   * Record an AuthZ-denied action. Forces `outcome: 'denied'` and requires
   * a human-readable `reason`. Most teams forget to log denials — they are
   * exactly what auditors and security teams ask for.
   */
  deny: (reason: string, input: Omit<AuditInput, 'outcome' | 'reason'>) => void
}

/**
 * Standalone audit emitter for non-request contexts (jobs, scripts, CLIs).
 *
 * Creates a one-shot logger, sets the audit fields, and emits immediately.
 * The event is force-kept past tail sampling. Returns the emitted wide event,
 * or `null` if logging is globally disabled.
 *
 * @example
 * ```ts
 * import { audit } from 'evlog'
 *
 * audit({
 *   action: 'cron.cleanup',
 *   actor: { type: 'system', id: 'cron' },
 *   target: { type: 'job', id: 'cleanup-stale-sessions' },
 *   outcome: 'success',
 * })
 * ```
 */
export function audit(input: AuditInput): WideEvent | null {
  const fields = buildAuditFields(input)
  const logger = createLogger({ audit: fields })
  const wide = logger.emit({ _forceKeep: true } as FieldContext<Record<string, unknown>> & { _forceKeep?: boolean })
  _testCollector?.(fields, wide)
  return wide
}

/**
 * Wrap a function so its outcome (success / failure / denied) is automatically
 * audited.
 *
 * Behaviour:
 * - If `fn` resolves, an audit event with `outcome: 'success'` is emitted.
 * - If `fn` throws an `EvlogError` (or any error) with `status === 403`, the
 *   audit event is recorded as `'denied'` with the error message as `reason`.
 * - Any other thrown error produces `outcome: 'failure'` and re-throws.
 *
 * Use {@link AuditDeniedError} to signal denial without an HTTP status.
 *
 * @example
 * ```ts
 * const refundInvoice = withAudit(
 *   { action: 'invoice.refund', target: (input) => ({ type: 'invoice', id: input.id }) },
 *   async (input: { id: string }, ctx: { actor: AuditActor }) => {
 *     await db.invoices.refund(input.id)
 *   }
 * )
 *
 * await refundInvoice({ id: 'inv_889' }, { actor: { type: 'user', id: user.id } })
 * ```
 */
export function withAudit<TInput, TOutput>(
  options: WithAuditOptions<TInput>,
  fn: (input: TInput, ctx: WithAuditContext) => Promise<TOutput> | TOutput,
): (input: TInput, ctx: WithAuditContext) => Promise<TOutput> {
  return async (input, ctx) => {
    const target = typeof options.target === 'function' ? options.target(input) : options.target
    try {
      const result = await fn(input, ctx)
      audit({
        action: options.action,
        actor: ctx.actor,
        target,
        outcome: 'success',
        causationId: ctx.causationId,
        correlationId: ctx.correlationId,
      })
      return result
    } catch (err) {
      const error = err as Error & { status?: number; statusCode?: number }
      const status = error.status ?? error.statusCode
      const denied = err instanceof AuditDeniedError || status === 403
      audit({
        action: options.action,
        actor: ctx.actor,
        target,
        outcome: denied ? 'denied' : 'failure',
        reason: error.message,
        causationId: ctx.causationId,
        correlationId: ctx.correlationId,
      })
      throw err
    }
  }
}

/**
 * Throw inside a {@link withAudit} body to mark the action as `outcome: 'denied'`
 * regardless of the underlying HTTP status. The constructor message becomes the
 * audit `reason`.
 */
export class AuditDeniedError extends Error {

  constructor(reason: string) {
    super(reason)
    this.name = 'AuditDeniedError'
  }

}

/** Options for {@link withAudit}. `target` may be derived from the input. */
export interface WithAuditOptions<TInput> {
  action: string
  target?: AuditTarget | ((input: TInput) => AuditTarget | undefined)
}

/**
 * Runtime context required by a {@link withAudit}-wrapped function.
 * The actor is always required; correlation IDs are optional.
 */
export interface WithAuditContext {
  actor: AuditActor
  causationId?: string
  correlationId?: string
}

/**
 * Compute a compact, redact-aware diff between two objects for the
 * `changes` field. Output is a JSON Patch-style array (RFC 6902 subset:
 * `add`, `remove`, `replace`) — small enough to ship over the wire.
 *
 * Object keys whose name matches one of the `redactPaths` (dot-notation, e.g.
 * `'user.password'`, `'card.cvv'`) are replaced with `'[REDACTED]'` so PII
 * never leaks through the diff.
 *
 * @example
 * ```ts
 * log.audit({
 *   action: 'user.update',
 *   actor: { type: 'user', id: user.id },
 *   target: { type: 'user', id: 'usr_42' },
 *   changes: auditDiff(before, after, { redactPaths: ['password'] }),
 * })
 * ```
 */
export function auditDiff(
  before: unknown,
  after: unknown,
  options: AuditDiffOptions = {},
): { before?: unknown, after?: unknown, patch: AuditPatchOp[] } {
  const replacement = options.replacement ?? '[REDACTED]'
  const redactSet = new Set((options.redactPaths ?? []).map(p => p))
  const patch: AuditPatchOp[] = []

  function isRedacted(path: string): boolean {
    if (redactSet.size === 0) return false
    if (redactSet.has(path)) return true
    for (const p of redactSet) {
      if (path.endsWith(`.${p}`)) return true
    }
    return false
  }

  function diff(a: unknown, b: unknown, path: string): void {
    if (a === b) return

    if (a === undefined && b !== undefined) {
      patch.push({ op: 'add', path: path || '/', value: redactValue(b, path) })
      return
    }
    if (a !== undefined && b === undefined) {
      patch.push({ op: 'remove', path: path || '/' })
      return
    }

    if (
      a !== null && b !== null
      && typeof a === 'object' && typeof b === 'object'
      && !Array.isArray(a) && !Array.isArray(b)
    ) {
      const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)])
      for (const key of keys) {
        diff((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}/${key}`)
      }
      return
    }

    patch.push({ op: 'replace', path: path || '/', value: redactValue(b, path) })
  }

  function redactValue(value: unknown, path: string): unknown {
    if (value === null || typeof value !== 'object') {
      const segs = path.split('/').filter(Boolean)
      const last = segs[segs.length - 1]
      if (last && isRedacted(last)) return replacement
      return value
    }
    if (Array.isArray(value)) {
      return value.map((v, i) => redactValue(v, `${path}/${i}`))
    }
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isRedacted(k) ? replacement : redactValue(v, `${path}/${k}`)
    }
    return out
  }

  diff(before, after, '')
  const result: { before?: unknown, after?: unknown, patch: AuditPatchOp[] } = { patch }
  if (options.includeBefore) result.before = redactValue(before, '')
  if (options.includeAfter) result.after = redactValue(after, '')
  return result
}

/** Single JSON Patch operation produced by {@link auditDiff}. */
export interface AuditPatchOp {
  op: 'add' | 'remove' | 'replace'
  path: string
  value?: unknown
}

/** Options for {@link auditDiff}. */
export interface AuditDiffOptions {
  /** Object keys (dot-notation) whose values should be replaced with `[REDACTED]`. */
  redactPaths?: string[]
  /** Custom replacement string. @default '[REDACTED]' */
  replacement?: string
  /** Include the full redacted `before` snapshot alongside the patch. */
  includeBefore?: boolean
  /** Include the full redacted `after` snapshot alongside the patch. */
  includeAfter?: boolean
}

/**
 * Define a typed audit action with an optional fixed target type.
 *
 * Returns a curried helper that fills in the action name (and target shape
 * if provided) so call sites stay terse and the action set is discoverable
 * in one place.
 *
 * @example
 * ```ts
 * const refund = defineAuditAction('invoice.refund', { target: 'invoice' })
 *
 * log.audit(refund({
 *   actor: { type: 'user', id: user.id },
 *   target: { id: 'inv_889' }, // type inferred as 'invoice'
 *   outcome: 'success',
 * }))
 * ```
 */
export function defineAuditAction<TTargetType extends string | undefined = undefined>(
  action: string,
  options?: { target?: TTargetType },
): DefinedAuditAction<TTargetType> {
  const targetType = options?.target
  return (input) => {
    const merged: AuditInput = {
      ...input,
      action,
    }
    if (targetType && input.target && !input.target.type) {
      merged.target = { ...input.target, type: targetType }
    }
    return merged
  }
}

/**
 * Return type of {@link defineAuditAction}. Accepts a partial input (no
 * `action`, target type pre-filled when provided).
 */
export type DefinedAuditAction<TTargetType extends string | undefined> = (
  input: TTargetType extends string
    ? Omit<AuditInput, 'action' | 'target'> & { target?: Omit<AuditTarget, 'type'> & { type?: TTargetType } }
    : Omit<AuditInput, 'action'>,
) => AuditInput

/**
 * Test helper that captures every audit event emitted while it is active.
 *
 * Returns `{ events, restore, expect }`:
 * - `events` — live array of captured `AuditFields`, populated as audits fire.
 * - `restore()` — uninstall the collector. Call from `afterEach()`.
 * - `expect.toIncludeAuditOf(matcher)` — assertion helper used inside `expect`
 *   blocks, returns `true` if at least one captured event matches.
 *
 * Only captures audits going through `log.audit()` and the standalone
 * `audit()` function. Events emitted via raw `log.set({ audit })` skip the
 * collector by design — wrap them with `log.audit()` to make them visible to
 * tests.
 *
 * @example
 * ```ts
 * const captured = mockAudit()
 * await refundInvoice('inv_889')
 * expect(captured.events).toHaveLength(1)
 * expect(captured.toIncludeAuditOf({ action: 'invoice.refund' })).toBe(true)
 * captured.restore()
 * ```
 */
export function mockAudit(): MockAudit {
  const events: AuditFields[] = []
  const previous = _testCollector
  _testCollector = (event) => {
    events.push(event)
  }

  return {
    events,
    restore() {
      _testCollector = previous
    },
    toIncludeAuditOf(matcher) {
      return events.some(event => matchesAudit(event, matcher))
    },
  }
}

/** Result of {@link mockAudit}. */
export interface MockAudit {
  events: AuditFields[]
  restore: () => void
  toIncludeAuditOf: (matcher: AuditMatcher) => boolean
}

/** Partial structural matcher for {@link MockAudit.toIncludeAuditOf}. */
export interface AuditMatcher {
  action?: string | RegExp
  outcome?: AuditFields['outcome']
  actor?: Partial<AuditActor>
  target?: Partial<AuditTarget>
}

function matchesAudit(event: AuditFields, matcher: AuditMatcher): boolean {
  if (matcher.action !== undefined) {
    if (matcher.action instanceof RegExp) {
      if (!matcher.action.test(event.action)) return false
    } else if (event.action !== matcher.action) {
      return false
    }
  }
  if (matcher.outcome !== undefined && event.outcome !== matcher.outcome) return false
  if (matcher.actor) {
    for (const [k, v] of Object.entries(matcher.actor)) {
      if ((event.actor as Record<string, unknown>)[k] !== v) return false
    }
  }
  if (matcher.target) {
    if (!event.target) return false
    for (const [k, v] of Object.entries(matcher.target)) {
      if ((event.target as Record<string, unknown>)[k] !== v) return false
    }
  }
  return true
}

/**
 * @internal Hook used by `RequestLogger.emit()` to detect audit-driven
 * force-keep flags on the accumulated context. Returns whether the event was
 * marked by `log.audit()` and clears the flag.
 */
export function consumeAuditForceKeep(context: Record<string, unknown>): boolean {
  if (context._auditForceKeep) {
    delete context._auditForceKeep
    return true
  }
  if (context.audit) return true
  return false
}

/**
 * @internal Decorate the audit field on an event right before drain — fills
 * in the deterministic idempotency key. Called by the logger pipeline so
 * it works for both `log.audit()` and direct `log.set({ audit })` paths.
 */
export function finalizeAudit(event: WideEvent): void {
  const a = event.audit as AuditFields | undefined
  if (!a) return
  const decorated = decorateAudit(a, String(event.timestamp))
  event.audit = decorated
}

/** Shape of the optional better-auth bridge for the audit enricher. */
export interface AuditEnricherBetterAuthBridge {
  /** Read the current authenticated session for this request, if any. */
  getSession: (ctx: EnrichContext) => Promise<AuditActor | null | undefined> | AuditActor | null | undefined
}

/** Options for {@link auditEnricher}. */
export interface AuditEnricherOptions {
  /**
   * Resolve the tenant id for the current request. The result is stored at
   * `event.audit.context.tenantId`. Multi-tenant SaaS gets isolation by default.
   */
  tenantId?: (ctx: EnrichContext) => string | undefined
  /**
   * Bridge to populate `event.audit.actor` from the authenticated session.
   * Only used when the application has not already filled `actor`.
   */
  bridge?: AuditEnricherBetterAuthBridge
  /** When true, overwrite existing context fields. @default false */
  overwrite?: boolean
}

/**
 * Enrich audit-bearing wide events with request, runtime, and tenant context.
 *
 * Runs only when `event.audit` is present — every other event passes through
 * untouched. Populates:
 * - `event.audit.context.requestId` from `ctx.request.requestId`
 * - `event.audit.context.traceId`   from `event.traceId`
 * - `event.audit.context.ip`        from `x-forwarded-for` / `x-real-ip`
 * - `event.audit.context.userAgent` from `user-agent`
 * - `event.audit.context.tenantId`  from `options.tenantId(ctx)`
 *
 * Optionally fills `event.audit.actor` from the better-auth bridge when the
 * caller did not provide one. Anything else (custom actor strategies,
 * extra context) belongs in a custom enricher — replace this one entirely.
 */
export function auditEnricher(options: AuditEnricherOptions = {}): (ctx: EnrichContext) => void | Promise<void> {
  return async (ctx) => {
    const event = ctx.event as WideEvent & { audit?: AuditFields }
    const a = event.audit
    if (!a) return

    const context = { ...(a.context ?? {}) }

    function setIfMissing(key: string, value: string | undefined): void {
      if (value === undefined) return
      if (options.overwrite || context[key] === undefined) context[key] = value
    }

    setIfMissing('requestId', ctx.request?.requestId)
    setIfMissing('traceId', typeof event.traceId === 'string' ? event.traceId : undefined)
    setIfMissing('ip', getHeader(ctx.headers, 'x-forwarded-for')?.split(',')[0]?.trim() ?? getHeader(ctx.headers, 'x-real-ip'))
    setIfMissing('userAgent', getHeader(ctx.headers, 'user-agent'))

    if (options.tenantId) {
      const tid = options.tenantId(ctx)
      if (tid !== undefined) setIfMissing('tenantId', tid)
    }

    let { actor } = a
    if (!actor && options.bridge) {
      const fromBridge = await options.bridge.getSession(ctx)
      if (fromBridge) actor = fromBridge
    }

    event.audit = { ...a, context, actor: actor ?? a.actor }
  }
}

// Re-imported here to avoid changing the long list of named imports at the top
// of this file; identical semantics to `getHeader` exported from `evlog/toolkit`.
function getHeader(headers: Record<string, string> | undefined, name: string): string | undefined {
  return getSharedHeader(headers, name)
}

/** Options accepted by {@link auditOnly}. */
export interface AuditOnlyOptions {
  /**
   * When true, the wrapper awaits the wrapped drain so the event is flushed
   * before the request resolves. Use for crash-safe audit storage.
   * @default false
   */
  await?: boolean
}

/** Drain function signature accepted by all wrappers. Matches `LoggerConfig['drain']`. */
export type DrainFn = (ctx: DrainContext) => void | Promise<void>

/**
 * Wrap any drain so it only receives events that carry an `audit` field.
 *
 * Use to route audit events to dedicated storage (separate Axiom dataset,
 * append-only Postgres table, FS journal) without affecting your main drain.
 *
 * Per-sink failure isolation comes from `initLogger({ drain: [...] })`: each
 * drain in the array is invoked independently, so a crashed Axiom call never
 * blocks the FS audit drain.
 *
 * @example
 * ```ts
 * import { initLogger, auditOnly } from 'evlog'
 * import { createAxiomDrain } from 'evlog/axiom'
 * import { createFsDrain } from 'evlog/fs'
 *
 * initLogger({
 *   drain: [
 *     createAxiomDrain({ dataset: 'logs' }),
 *     auditOnly(createFsDrain({ dir: '.audit' }), { await: true }),
 *   ],
 * })
 * ```
 */
export function auditOnly(drain: DrainFn, options: AuditOnlyOptions = {}): DrainFn {
  return async (ctx) => {
    if (!ctx.event.audit) return
    if (options.await) {
      await drain(ctx)
      return
    }
    drain(ctx)
  }
}

/** Pluggable persistence for the hash-chain state. */
export interface SignedChainState {
  /** Load the previous hash from durable storage, or `null` on first run. */
  load: () => Promise<string | null> | string | null
  /** Persist the latest hash so the chain survives process restarts. */
  save: (hash: string) => Promise<void> | void
}

/** Options for {@link signed}. Pick a strategy at construction time. */
export type SignedOptions =
  | { strategy: 'hmac', secret: string, algorithm?: 'sha256' | 'sha512' }
  | { strategy: 'hash-chain', state?: SignedChainState, algorithm?: 'sha256' | 'sha512' }

/**
 * Wrap a drain so every event passing through gains tamper-evident integrity.
 *
 * - `'hmac'` — adds `event.audit.signature` (HMAC of the canonical event).
 * - `'hash-chain'` — adds `event.audit.prevHash` and `event.audit.hash` so the
 *   sequence of events forms a verifiable chain. State persists in memory
 *   by default; pass a `state: { load, save }` for cross-process / durable
 *   chains (Redis, file, Postgres).
 *
 * The signature is computed before the event is forwarded to the wrapped
 * drain — combine with {@link auditOnly} when you only want integrity for
 * audit events.
 *
 * @example
 * ```ts
 * import { initLogger, auditOnly, signed } from 'evlog'
 * import { createFsDrain } from 'evlog/fs'
 *
 * initLogger({
 *   drain: auditOnly(
 *     signed(createFsDrain({ dir: '.audit' }), { strategy: 'hash-chain' }),
 *     { await: true },
 *   ),
 * })
 * ```
 */
export function signed(drain: DrainFn, options: SignedOptions): DrainFn {
  if (options.strategy === 'hmac') {
    const algorithm = options.algorithm ?? 'sha256'
    const { secret } = options
    return async (ctx) => {
      const a = ctx.event.audit as AuditFields | undefined
      if (a) {
        const payload = stableStringify(stripIntegrity(ctx.event))
        const signature = await hmacHex(algorithm, secret, payload)
        ctx.event.audit = { ...a, signature }
      }
      await drain(ctx)
    }
  }

  const algorithm = options.algorithm ?? 'sha256'
  const { state } = options
  let inMemoryPrev: string | null = null
  let initialised = !state
  let queue: Promise<void> = Promise.resolve()

  return (ctx) => {
    queue = queue.then(async () => {
      const a = ctx.event.audit as AuditFields | undefined
      if (a) {
        if (!initialised && state) {
          inMemoryPrev = (await state.load()) ?? null
          initialised = true
        }
        const prevHash = inMemoryPrev ?? undefined
        const payload = stableStringify({ ...stripIntegrity(ctx.event), audit: { ...stripIntegrity(ctx.event).audit, prevHash } })
        const hash = await digestHex(algorithm, payload)
        ctx.event.audit = { ...a, prevHash, hash }
        inMemoryPrev = hash
        await state?.save(hash)
      }
      await drain(ctx)
    }).catch((err) => {
      console.error('[evlog/audit] signed drain failed:', err)
    })
    return queue
  }
}

/**
 * @internal Resolve the Web Crypto SubtleCrypto interface. Available natively
 * in browsers, Node 19+, Bun, Deno, and Cloudflare Workers. Falls back to
 * Node's `webcrypto` for Node 18 (where `globalThis.crypto` is gated behind
 * a flag). The dynamic import keeps `node:crypto` out of browser bundles.
 */
async function getSubtle(): Promise<SubtleCrypto> {
  const c = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto
  if (c?.subtle) return c.subtle
  const mod = await import(/* @vite-ignore */ 'node:crypto') as { webcrypto: { subtle: SubtleCrypto } }
  return mod.webcrypto.subtle
}

function normalizeAlgo(algorithm: string): string {
  switch (algorithm.toLowerCase()) {
    case 'sha1':
    case 'sha-1':
      return 'SHA-1'
    case 'sha256':
    case 'sha-256':
      return 'SHA-256'
    case 'sha384':
    case 'sha-384':
      return 'SHA-384'
    case 'sha512':
    case 'sha-512':
      return 'SHA-512'
    default:
      return 'SHA-256'
  }
}

function bufToHex(buf: ArrayBuffer): string {
  let out = ''
  for (const byte of new Uint8Array(buf)) out += byte.toString(16).padStart(2, '0')
  return out
}

async function digestHex(algorithm: string, data: string): Promise<string> {
  const subtle = await getSubtle()
  const buf = await subtle.digest(normalizeAlgo(algorithm), new TextEncoder().encode(data))
  return bufToHex(buf)
}

async function hmacHex(algorithm: string, secret: string, data: string): Promise<string> {
  const subtle = await getSubtle()
  const hash = normalizeAlgo(algorithm)
  const key = await subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash }, false, ['sign'])
  const sig = await subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return bufToHex(sig)
}

/** @internal Strip integrity fields before hashing so signatures stay stable. */
function stripIntegrity(event: WideEvent): WideEvent {
  const a = event.audit as AuditFields | undefined
  if (!a) return event
  const { signature, prevHash, hash, ...rest } = a
  return { ...event, audit: rest as AuditFields }
}

/**
 * Strict redact preset for audit events.
 *
 * Combine with the user's existing redact configuration via spread:
 * `initLogger({ redact: { paths: [...auditRedactPreset.paths!, ...mine] } })`.
 *
 * Hardens PII handling:
 * - Drops `Authorization` and `Cookie` headers anywhere they appear.
 * - Drops common credential field names (`password`, `passwordHash`, `token`,
 *   `apiKey`, `secret`, `accessToken`, `refreshToken`, `cardNumber`, `cvv`,
 *   `ssn`).
 *
 * Built-in pattern maskers (email, credit card, …) keep their default
 * behaviour — partial masking, not full redaction — so audit trails retain
 * enough signal to be useful.
 */
export const auditRedactPreset: RedactConfig = {
  paths: [
    'audit.changes.before.password',
    'audit.changes.before.passwordHash',
    'audit.changes.before.token',
    'audit.changes.before.apiKey',
    'audit.changes.before.secret',
    'audit.changes.before.accessToken',
    'audit.changes.before.refreshToken',
    'audit.changes.before.cardNumber',
    'audit.changes.before.cvv',
    'audit.changes.before.ssn',
    'audit.changes.after.password',
    'audit.changes.after.passwordHash',
    'audit.changes.after.token',
    'audit.changes.after.apiKey',
    'audit.changes.after.secret',
    'audit.changes.after.accessToken',
    'audit.changes.after.refreshToken',
    'audit.changes.after.cardNumber',
    'audit.changes.after.cvv',
    'audit.changes.after.ssn',
    'headers.authorization',
    'headers.cookie',
    'headers.set-cookie',
    'audit.context.headers.authorization',
    'audit.context.headers.cookie',
  ],
}
