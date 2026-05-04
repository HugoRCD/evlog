/**
 * @deprecated Adapter-internal shim. Import from `evlog/toolkit` instead:
 * `import { defineDrain, defineHttpDrain } from 'evlog/toolkit'`.
 *
 * Kept so the built-in adapter files keep their relative imports during the
 * toolkit refactor; will be removed once all internal references update.
 */
export { defineDrain, defineHttpDrain } from '../shared/drain'
export type { DrainOptions, HttpDrainOptions, HttpDrainRequest } from '../shared/drain'
