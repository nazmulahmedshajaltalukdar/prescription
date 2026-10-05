import { describe, expect, it } from 'vitest'
import { getPlanByTier, getPlanForSeatCount } from './tenantPlans'

describe('tenant plans', () => {
  it('returns the solo chamber plan for a single doctor', () => {
    expect(getPlanByTier('solo_chamber').label).toBe('Solo Chamber')
    expect(getPlanByTier('solo_chamber').userLimit).toBe(3)
  })

  it('maps the seat count to the correct plan tier', () => {
    expect(getPlanForSeatCount(1).tier).toBe('solo_chamber')
    expect(getPlanForSeatCount(5).tier).toBe('starter_5')
    expect(getPlanForSeatCount(10).tier).toBe('starter_10')
    expect(getPlanForSeatCount(20).tier).toBe('standard_20')
    expect(getPlanForSeatCount(50).tier).toBe('growth_50')
    expect(getPlanForSeatCount(100).tier).toBe('enterprise_100')
  })
})
