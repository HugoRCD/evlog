import { describe, expectTypeOf, it } from 'vitest'
import { telemetry } from '../src/create'

describe('telemetry.set typing', () => {
  it('accepts numbers and booleans without collect', () => {
    expectTypeOf(telemetry.set).toBeCallableWith({ checksFailed: 2, ok: true })
  })

  it('rejects undeclared string fields at compile time', () => {
    // @ts-expect-error framework requires collect.fields declaration
    expectTypeOf(telemetry.set).toBeCallableWith({ framework: 'nuxt' })
  })
})
