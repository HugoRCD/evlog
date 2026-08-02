import { describe, expect, it } from 'vitest'
import { percentageOf, pointDelta, relativeDelta } from '../shared/utils/trends'

describe('relativeDelta', () => {
  it('reports growth and decline as a ratio', () => {
    expect(relativeDelta(120, 100)).toBeCloseTo(0.2)
    expect(relativeDelta(80, 100)).toBeCloseTo(-0.2)
    expect(relativeDelta(100, 100)).toBe(0)
  })

  it('has no baseline to divide by when the previous window was empty', () => {
    expect(relativeDelta(50, 0)).toBeNull()
    expect(relativeDelta(0, 0)).toBeNull()
  })
})

describe('pointDelta', () => {
  it('subtracts percentages rather than dividing them', () => {
    expect(pointDelta(98, 96)).toBe(2)
    expect(pointDelta(90, 96)).toBe(-6)
  })
})

describe('percentageOf', () => {
  it('scales a share to 0-100', () => {
    expect(percentageOf(1, 4)).toBe(25)
    expect(percentageOf(4, 4)).toBe(100)
  })

  it('is zero when there is nothing to divide', () => {
    expect(percentageOf(0, 0)).toBe(0)
  })
})
