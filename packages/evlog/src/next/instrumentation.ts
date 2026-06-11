/**
 * Edge-safe Next.js instrumentation gate — no logger imports.
 *
 * - Root `instrumentation.ts`: `defineNodeInstrumentation({ service, ... })` from here.
 * - Advanced: `createInstrumentation` from `evlog/next/instrumentation/create`.
 */
export {
  defineNodeInstrumentation,
  type DefineNodeInstrumentationInput,
  type NextInstrumentationErrorContext,
  type NextInstrumentationRequest,
  type NodeInstrumentationHooks,
  type NodeInstrumentationModule,
} from './instrumentation-gate'

export type {
  CaptureOutputOptions,
  InstrumentationOptions,
} from './instrumentation-create'
