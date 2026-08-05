import { describe, expect, it } from 'vitest'
import { flagLabel, flagName, isValueSet } from '../app/utils/flag-format'

describe('flagName', () => {
  it('spells a parser key back as the option that produced it', () => {
    expect(flagName('minScore')).toBe('--min-score')
    expect(flagName('all')).toBe('--all')
    expect(flagName('noHeader')).toBe('--no-header')
  })
})

describe('flagLabel', () => {
  it('renders a boolean as the switch, on or negated', () => {
    expect(flagLabel('all', true)).toBe('--all')
    expect(flagLabel('write', false)).toBe('--no-write')
  })

  it('keeps a numeric value alongside its option', () => {
    expect(flagLabel('minScore', 90)).toBe('--min-score 90')
  })

  it('shows an allowlisted string value', () => {
    expect(flagLabel('framework', 'nuxt')).toBe('--framework nuxt')
  })

  it('marks an uncollected value rather than inventing one', () => {
    /* `<set>` means a value was passed and deliberately not recorded. Printing
       it raw reads as the literal argument the user typed, which it is not. */
    expect(flagLabel('baseline', '<set>')).toBe('--baseline …')
    expect(isValueSet('<set>')).toBe(true)
    expect(isValueSet('nuxt')).toBe(false)
  })
})
