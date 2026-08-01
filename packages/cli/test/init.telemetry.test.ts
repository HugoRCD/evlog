import { describe, expect, it } from 'vitest'
import { DESTINATIONS, ENRICHERS, EXTRAS, SAMPLING_PRESETS } from '../src/lib/init/catalog'
import { INIT_TELEMETRY_FIELDS, initTelemetryFieldNames, memberField } from '../src/lib/init/telemetry'

describe('init telemetry fields', () => {
  it('allowlists every value the catalog can produce', () => {
    /* A value outside its allowlist is dropped by the collector without a
       word, so a catalog entry added without touching the allowlist would make
       that option invisible in the numbers rather than loudly broken. */
    expect(INIT_TELEMETRY_FIELDS.initDevDrain).toEqual(
      expect.arrayContaining(DESTINATIONS.map(destination => destination.id)),
    )
    expect(INIT_TELEMETRY_FIELDS.initSampling).toEqual(
      expect.arrayContaining(SAMPLING_PRESETS.map(preset => preset.id)),
    )
  })

  it('gives every multi-select option a field of its own', () => {
    const names = initTelemetryFieldNames()

    for (const destination of DESTINATIONS) {
      expect(names, destination.id).toContain(memberField('Prod', destination.id))
    }
    for (const extra of EXTRAS) {
      expect(names, extra.id).toContain(memberField('Extra', extra.id))
    }
    for (const enricher of ENRICHERS) {
      expect(names, enricher.id).toContain(memberField('Enricher', enricher.id))
    }
  })

  it('never names a field that could carry what the user typed', () => {
    /* The service name is the one free-text answer in the flow. Nothing here
       may carry it, nor a path, nor anything read out of their source. */
    const names = initTelemetryFieldNames()

    for (const name of names) {
      expect(name).toMatch(/^init[A-Z]/)
      expect(name.toLowerCase()).not.toContain('service')
      expect(name.toLowerCase()).not.toContain('name')
      expect(name.toLowerCase()).not.toContain('path')
    }
  })

  it('keeps the field names distinct', () => {
    const names = initTelemetryFieldNames()

    expect(new Set(names).size).toBe(names.length)
  })
})
