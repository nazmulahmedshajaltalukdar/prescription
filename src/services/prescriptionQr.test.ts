import { describe, expect, it } from 'vitest'
import { buildPrescriptionQrPayload, generatePrescriptionQrDataUrl } from './prescriptionQr'

describe('buildPrescriptionQrPayload', () => {
  it('encodes only the saved prescription identifier', () => {
    expect(buildPrescriptionQrPayload('a7d9')).toBe('clinic-prescription:a7d9')
    expect(buildPrescriptionQrPayload(42)).toBe('clinic-prescription:42')
  })

  it('generates a scannable PNG QR image from the identifier', async () => {
    const image = await generatePrescriptionQrDataUrl('a7d9')
    expect(image).toMatch(/^data:image\/png;base64,/)
  })
})