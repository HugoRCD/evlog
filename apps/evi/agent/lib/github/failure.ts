interface FailureEvent {
  readonly code?: string
  readonly message?: string
}

/** Failure reply for interactive GitHub turns: lead, truncated hint, guidance, error code. */
export function failureComment(lead: string, guidance: string, event: FailureEvent): string {
  const hint = event.message?.trim()
  const lines = [`${lead}${hint ? ` (${truncate(hint)})` : ''}.`, '', guidance]
  if (event.code) lines.push('', `_Error code: \`${event.code}\`_`)
  return lines.join('\n')
}

function truncate(text: string, max = 160): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}
