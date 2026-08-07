/**
 * The channel name eve reports, without its prefix. Framework channels arrive
 * bare (`http`, `schedule`); authored ones as `channel:<filename>`.
 */
export function channelName(kind?: string): string {
  return (kind ?? 'unknown').replace(/^channel:/, '')
}
