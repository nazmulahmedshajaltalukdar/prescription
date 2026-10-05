import { describe, expect, it } from 'vitest'
import { findPhoneMatches, normalizePhone } from './appointmentRequests'

describe('appointment request phone matching', () => {
  it('normalizes phone numbers without changing their stored value', () => {
    expect(normalizePhone('+880 1712-345678')).toBe('8801712345678')
  })

  it('matches by the last seven digits and avoids short ambiguous searches', () => {
    const patients = [
      { name: 'A', phone: '+880 1712-345678' },
      { name: 'B', phone: '01899999999' },
      { name: 'C', phone: '5551234' },
    ]
    expect(findPhoneMatches(patients, '01712 345678').map((patient) => patient.name)).toEqual(['A'])
    expect(findPhoneMatches(patients, '123456').length).toBe(0)
  })
})
