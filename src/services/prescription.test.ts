import { describe, expect, it } from 'vitest'
import { buildPrescriptionPayload, getPrescriptionDraftStorageKey, normalizePrescriptionItems } from './prescription'

describe('getPrescriptionDraftStorageKey', () => {
  it('isolates drafts by tenant, location, and user', () => {
    const clinicAKey = getPrescriptionDraftStorageKey({ userId: 'user-a', tenantId: 'tenant-a', subTenantId: 'main' })
    const clinicBKey = getPrescriptionDraftStorageKey({ userId: 'user-b', tenantId: 'tenant-b', subTenantId: 'main' })
    const locationKey = getPrescriptionDraftStorageKey({ userId: 'user-a', tenantId: 'tenant-a', subTenantId: 'branch' })

    expect(clinicAKey).not.toBe(clinicBKey)
    expect(clinicAKey).not.toBe(locationKey)
  })
})

describe('normalizePrescriptionItems', () => {
  it('removes blank rows and trims values', () => {
    const result = normalizePrescriptionItems([
      { generic: '  Paracetamol ', brand: ' Napa ', dose: ' 500mg ', frequency: ' 1-0-1 ', duration: ' 5 days ', instructions: ' after food ' },
      { generic: '', brand: '', dose: '', frequency: '', duration: '', instructions: '' },
    ])

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      generic: 'Paracetamol',
      brand: 'Napa',
      dose: '500mg',
      frequency: '1-0-1',
      duration: '5 days',
      instructions: 'after food',
    })
  })
})

describe('buildPrescriptionPayload', () => {
  it('creates a payload suitable for save operations', () => {
    const printDetails = {
      prescription_no: 'RX-2026-ABC123',
      follow_up_date: '2026-05-03',
      warnings: 'Check for allergy',
      is_emergency: true,
      signature_data_url: 'data:image/png;base64,abc',
    }
    const payload = buildPrescriptionPayload(
      'visit-123',
      [{ generic: 'Amoxicillin', brand: 'Amox', dose: '500mg' }],
      'Take after food',
      'doc-1',
      'tenant-1',
      'clinic-a',
      printDetails,
    )

    expect(payload).toMatchObject({
      visit_id: 'visit-123',
      doctor_id: 'doc-1',
      notes: 'Take after food',
      tenant_id: 'tenant-1',
      sub_tenant_id: 'clinic-a',
      print_details: printDetails,
    })
    expect(payload.items).toHaveLength(1)
  })
})
