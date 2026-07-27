import { telemetry } from '@evlog/telemetry'
import { DESTINATIONS, ENRICHERS, EXTRAS, SAMPLING_PRESETS } from './catalog'
import type { InitResult } from './run'

/**
 * Which choices `init` recorded on the run's telemetry event.
 *
 * The point is to learn which options people actually pick, so the flow can put
 * the useful ones first and stop offering the ones nobody wants. Only values
 * from this CLI's own catalog are sent: every field below is an id we defined,
 * a count, or a boolean. The service name, the package name, file paths and
 * anything read out of the user's source stay where they are.
 */
const PREFIX = 'init'

/** String fields, with the exact set of values each may take. */
export const INIT_TELEMETRY_FIELDS = {
  initFramework: ['nuxt', 'nitro', 'next', 'tanstack-start'],
  initDevDrain: DESTINATIONS.map(destination => destination.id),
  initSampling: SAMPLING_PRESETS.map(preset => preset.id),
} as const satisfies Record<string, readonly string[]>

function pascal(id: string): string {
  return id.split('-').map(part => part[0]!.toUpperCase() + part.slice(1)).join('')
}

/** Field name for a multi-select member: `axiom` → `initProdAxiom`. */
export function memberField(group: 'Prod' | 'Extra' | 'Enricher', id: string): string {
  return `${PREFIX}${group}${pascal(id)}`
}

/**
 * Record the answers on the active telemetry run.
 *
 * Multi-selects become one boolean per chosen option rather than a joined
 * string: "how many runs picked Axiom" is then a count rather than a substring
 * match, and only the chosen ones are sent, so the event stays small.
 */
export function recordInitAnswers(result: InitResult): void {
  const { answers } = result

  const fields: Record<string, boolean | number | string> = {
    initFramework: answers.framework,
    initDevDrain: answers.devDrain,
    initInteractive: result.interactive,
    initCancelled: result.cancelled,
    initProdDrainCount: answers.prodDrains.length,
  }

  if (answers.extras.includes('sampling')) fields.initSampling = answers.sampling
  for (const id of answers.prodDrains) fields[memberField('Prod', id)] = true
  for (const id of answers.extras) fields[memberField('Extra', id)] = true
  for (const id of answers.enrichers) fields[memberField('Enricher', id)] = true

  if (!result.cancelled) {
    fields.initFilesWritten = result.written.length
    fields.initManualSteps = result.manual.length
    fields.initDryRun = result.dryRun
    if (result.verified) fields.initDoctorFail = result.verified.fail
  }

  /* Whether an offer had anything behind it, without saying what. The gap
     between "the error catalog was offered" and "it was taken" is the signal
     that says whether the offer is worth keeping. */
  if (result.insight) {
    fields.initHadRepeatedErrors = result.insight.repeatedErrors > 0
    fields.initHadAuditGaps = result.insight.auditGaps > 0
  }

  /* The ambient setter is typed for numbers and booleans because a string is
     only accepted when its key is allowlisted — which ours are, on the
     `withTelemetry` wrapper, and `sanitizeCustom` drops anything else. The cast
     buys the string fields; it cannot smuggle an unlisted value past the
     runtime check. */
  telemetry.set(fields as Record<string, boolean | number>)
}

/** Every field name this module can emit — used to document the disclosure. */
export function initTelemetryFieldNames(): string[] {
  return [
    ...Object.keys(INIT_TELEMETRY_FIELDS),
    'initInteractive',
    'initCancelled',
    'initProdDrainCount',
    'initFilesWritten',
    'initManualSteps',
    'initDryRun',
    'initDoctorFail',
    'initHadRepeatedErrors',
    'initHadAuditGaps',
    ...DESTINATIONS.map(destination => memberField('Prod', destination.id)),
    ...EXTRAS.map(extra => memberField('Extra', extra.id)),
    ...ENRICHERS.map(enricher => memberField('Enricher', enricher.id)),
  ]
}
