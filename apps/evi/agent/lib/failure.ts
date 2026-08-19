interface FailureEvent {
  readonly code?: string
  readonly message?: string
}

/** One line of the value, truncated so an error dump never floods a thread. */
export function flattenInline(value: unknown, max = 160): string {
  // JSON.stringify returns undefined for undefined and functions.
  const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value))
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`
}

/** Failure reply for interactive GitHub turns: lead, truncated hint, guidance, error code. */
export function failureComment(lead: string, guidance: string, event: FailureEvent): string {
  const hint = event.message?.trim()
  const lines = [`${lead}${hint ? ` (${flattenInline(hint)})` : ''}.`, '', guidance]
  if (event.code) lines.push('', `_Error code: \`${event.code}\`_`)
  return lines.join('\n')
}

/** The same failure as a single chat line, for channels without markdown. */
export function failureLine(lead: string, guidance: string, event: FailureEvent): string {
  const hint = event.message ? ` (${flattenInline(event.message)})` : ''
  const code = event.code ? ` [${event.code}]` : ''
  return `${lead}${hint}${code}. ${guidance}`
}
