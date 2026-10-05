import QRCode from 'qrcode'

export function buildPrescriptionQrPayload(prescriptionId: string | number) {
  return `clinic-prescription:${String(prescriptionId)}`
}

export function generatePrescriptionQrDataUrl(prescriptionId: string | number) {
  return QRCode.toDataURL(buildPrescriptionQrPayload(prescriptionId), {
    width: 240,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#111827', light: '#FFFFFF' },
  })
}