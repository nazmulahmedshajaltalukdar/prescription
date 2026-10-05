import { describe, expect, it } from 'vitest'
import { getExternalClinicStatus } from './externalClinicAdapter'

describe('getExternalClinicStatus', () => {
  it('keeps external integration visibly pending when no provider is installed', () => {
    expect(getExternalClinicStatus()).toEqual({
      configured: false,
      provider: null,
      message: 'External system is not configured. Internal clinic workflows remain available.',
    })
  })
})