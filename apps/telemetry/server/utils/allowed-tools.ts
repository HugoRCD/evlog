/** Tool names accepted by `/api/telemetry/ingest` when no override is configured. */
export const DEFAULT_ALLOWED_TOOLS = ['evlog-cli']

/**
 * Custom field keys accepted per tool. Mirrors `telemetry.set()` calls in each
 * tool's source — anything not listed here is dropped by `parseIngestBody()`.
 */
export const DEFAULT_ALLOWED_CUSTOM_KEYS: Record<string, string[]> = {
  'evlog-cli': ['checksFailed', 'checksWarned', 'workspace'],
}

/** Parse a comma-separated allowlist of tool names from an env value. */
export function parseAllowedTools(raw: string | undefined): string[] {
  if (!raw?.trim()) return DEFAULT_ALLOWED_TOOLS
  const tools = raw.split(',').map(t => t.trim()).filter(Boolean)
  return tools.length > 0 ? tools : DEFAULT_ALLOWED_TOOLS
}

function isRecordOfStringArrays(value: unknown): value is Record<string, string[]> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return Object.values(value).every(
    v => Array.isArray(v) && v.every(item => typeof item === 'string'),
  )
}

/**
 * Parse a JSON-encoded `{ toolName: string[] }` custom-key allowlist from an
 * env value, merged on top of the built-in defaults above.
 */
export function parseAllowedCustomKeys(raw: string | undefined): Record<string, string[]> {
  if (!raw?.trim()) return DEFAULT_ALLOWED_CUSTOM_KEYS

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecordOfStringArrays(parsed)) return DEFAULT_ALLOWED_CUSTOM_KEYS
    return { ...DEFAULT_ALLOWED_CUSTOM_KEYS, ...parsed }
  } catch {
    return DEFAULT_ALLOWED_CUSTOM_KEYS
  }
}
