function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  if (Object.prototype.toString.call(value) !== '[object Object]') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || value.constructor === Object
}

function stableStringify(value: unknown, ancestors = new WeakSet<object>()): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (ancestors.has(value)) return '"[Circular]"'
  if (!Array.isArray(value) && !isPlainObject(value)) return JSON.stringify(value)
  ancestors.add(value)
  const out = Array.isArray(value)
    ? `[${value.map(v => stableStringify(v, ancestors)).join(',')}]`
    : `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableStringify(value[k], ancestors)}`).join(',')}}`
  ancestors.delete(value)
  return out
}

function fnv1a32(input: string, seed: number): number {
  let h = seed >>> 0
  const bytes = new TextEncoder().encode(input)
  for (const byte of bytes) {
    h ^= byte
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/**
 * Derive a deterministic idempotency key for a telemetry run event.
 * Same algorithm family as audit idempotency in `evlog/audit`.
 */
export function computeRunIdempotencyKey(payload: {
  command: string
  tool: { name: string, version: string }
  timestamp: string
  machineId?: string
}): string {
  const seconds = payload.timestamp.slice(0, 19)
  const canonical = stableStringify({
    command: payload.command,
    tool: payload.tool,
    timestamp: seconds,
    machineId: payload.machineId,
  })
  const a = fnv1a32(canonical, 0x811c9dc5).toString(16).padStart(8, '0')
  const b = fnv1a32(canonical, 0xdeadbeef).toString(16).padStart(8, '0')
  const c = fnv1a32(canonical, 0x1f83d9ab).toString(16).padStart(8, '0')
  const d = fnv1a32(canonical, 0x5be0cd19).toString(16).padStart(8, '0')
  return a + b + c + d
}
