/**
 * The channel name eve reports, without its prefix.
 *
 * Framework channels arrive bare (`http`, `schedule`, `subagent`); authored ones
 * as `channel:<filename>`, so `agent/channels/github.ts` is `channel:github`.
 * Comparing against the bare name without stripping never matches.
 */
export function channelName(kind?: string): string {
  return (kind ?? 'unknown').replace(/^channel:/, '')
}
