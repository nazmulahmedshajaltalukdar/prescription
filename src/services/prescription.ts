import { PrescriptionItem, PrescriptionPrintDetails } from '../types'

export function getPrescriptionDraftStorageKey({
  userId,
  tenantId,
  subTenantId,
}: {
  userId: string
  tenantId: string
  subTenantId?: string
}) {
  return `prescription:draft:${encodeURIComponent(tenantId)}:${encodeURIComponent(subTenantId || '')}:${encodeURIComponent(userId)}`
}

export function normalizePrescriptionItems(items: PrescriptionItem[]) {
  return items
    .filter((item) => !!(item.generic?.trim() || item.brand?.trim() || item.dose?.trim() || item.frequency?.trim() || item.duration?.trim() || item.instructions?.trim()))
    .map((item) => ({
      ...item,
      generic: item.generic?.trim() || '',
      brand: item.brand?.trim() || '',
      dose: item.dose?.trim() || '',
      frequency: item.frequency?.trim() || '',
      duration: item.duration?.trim() || '',
      instructions: item.instructions?.trim() || '',
    }))
}

export function buildPrescriptionPayload(
  visitId: string,
  items: PrescriptionItem[],
  notes: string,
  doctorId?: string | null,
  tenantId?: string | null,
  subTenantId?: string | null,
  printDetails?: PrescriptionPrintDetails,
) {
  return {
    visit_id: visitId,
    tenant_id: tenantId || undefined,
    sub_tenant_id: subTenantId || undefined,
    doctor_id: doctorId || undefined,
    items: normalizePrescriptionItems(items),
    notes: notes.trim() || undefined,
    print_details: printDetails,
    created_at: new Date().toISOString(),
  }
}
