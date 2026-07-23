import { describe, expect, it } from 'vitest'
import { TELEMETRY_ENDPOINT, TOOL_NAME } from '../src/lib/constants'

describe('TELEMETRY_ENDPOINT', () => {
  it('is an absolute HTTPS URL pointing at the telemetry ingest route', () => {
    const url = new URL(TELEMETRY_ENDPOINT)
    expect(url.protocol).toBe('https:')
    expect(url.pathname).toBe('/api/telemetry/ingest')
  })
})

describe('TOOL_NAME', () => {
  it('matches the allowlisted tool name in apps/telemetry', () => {
    expect(TOOL_NAME).toBe('evlog-cli')
  })
})
