import { describe, expect, it } from 'vitest'
import { formatSerialNumber, getNextSerialNumber, getWeekDates, localDateKey } from './clinicWorkflow'

describe('clinic workflow helpers', () => {
  it('uses the local calendar date for appointment and queue days', () => {
    expect(localDateKey(new Date(2026, 9, 4))).toBe('2026-10-04')
  })

  it('returns a Monday-to-Sunday calendar week', () => {
    expect(getWeekDates(new Date(2026, 9, 4)).map(localDateKey)).toEqual([
      '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
    ])
  })

  it('increments serials independently for tenant, clinic, and day', () => {
    const tickets = [
      { tenant_id: 't1', sub_tenant_id: 'c1', date_key: '2026-10-04', serial_number: 8 },
      { tenant_id: 't1', sub_tenant_id: 'c2', date_key: '2026-10-04', serial_number: 14 },
      { tenant_id: 't1', sub_tenant_id: 'c1', date_key: '2026-10-03', serial_number: 20 },
      { tenant_id: 't2', sub_tenant_id: 'c1', date_key: '2026-10-04', serial_number: 30 },
    ]
    expect(getNextSerialNumber(tickets, 't1', 'c1', '2026-10-04')).toBe(9)
    expect(formatSerialNumber(9)).toBe('S-009')
  })
})