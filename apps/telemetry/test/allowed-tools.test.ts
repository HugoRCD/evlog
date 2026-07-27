import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ALLOWED_CUSTOM_KEYS,
  DEFAULT_ALLOWED_TOOLS,
  parseAllowedCustomKeys,
  parseAllowedTools,
} from '../server/utils/allowed-tools'

describe('parseAllowedTools', () => {
  it('falls back to the default allowlist when unset', () => {
    expect(parseAllowedTools(undefined)).toEqual(DEFAULT_ALLOWED_TOOLS)
    expect(parseAllowedTools('')).toEqual(DEFAULT_ALLOWED_TOOLS)
    expect(parseAllowedTools('   ')).toEqual(DEFAULT_ALLOWED_TOOLS)
  })

  it('parses a comma-separated list, trimming whitespace', () => {
    expect(parseAllowedTools('evlog-cli, my-tool ,other')).toEqual(['evlog-cli', 'my-tool', 'other'])
  })

  it('drops empty entries and falls back when nothing remains', () => {
    expect(parseAllowedTools(',,')).toEqual(DEFAULT_ALLOWED_TOOLS)
  })
})

describe('parseAllowedCustomKeys', () => {
  it('falls back to the default map when unset or invalid', () => {
    expect(parseAllowedCustomKeys(undefined)).toEqual(DEFAULT_ALLOWED_CUSTOM_KEYS)
    expect(parseAllowedCustomKeys('not json')).toEqual(DEFAULT_ALLOWED_CUSTOM_KEYS)
    expect(parseAllowedCustomKeys('{"tool": "not-an-array"}')).toEqual(DEFAULT_ALLOWED_CUSTOM_KEYS)
    expect(parseAllowedCustomKeys('{"tool": [1, 2]}')).toEqual(DEFAULT_ALLOWED_CUSTOM_KEYS)
  })

  it('merges a valid JSON map on top of the defaults', () => {
    expect(parseAllowedCustomKeys('{"my-tool":["itemsSynced"]}')).toEqual({
      ...DEFAULT_ALLOWED_CUSTOM_KEYS,
      'my-tool': ['itemsSynced'],
    })
  })

  it('lets an override replace the default keys for evlog-cli', () => {
    expect(parseAllowedCustomKeys('{"evlog-cli":["onlyThis"]}')).toEqual({
      'evlog-cli': ['onlyThis'],
    })
  })
})

describe('the evlog-cli allowlist against the CLI itself', () => {
  it('accepts every field evlog init can set', async () => {
    /* The two lists are maintained by hand on either side of an HTTP boundary,
       and a name missing here is dropped by the ingest without a word — the
       option simply never appears in the numbers. Reading the CLI's own list is
       what turns that silence into a failing test. */
    const { initTelemetryFieldNames } = await import('../../../packages/cli/src/lib/init/telemetry')
    const allowed = new Set(DEFAULT_ALLOWED_CUSTOM_KEYS['evlog-cli'])

    for (const name of initTelemetryFieldNames()) {
      expect(allowed.has(name), `${name} would be dropped by the ingest`).toBe(true)
    }
  })
})
