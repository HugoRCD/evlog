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
