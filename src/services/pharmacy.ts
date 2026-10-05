import { DispenseRequest, InventoryItem, PharmacyPrescriptionLink } from '../types'
import { InventoryContext, createInventoryAdapter } from './inventory'
import { getStorage } from './storage'
import { isSupabaseConfigured, supabase } from './supabaseClient'

function getLinksKey(context: InventoryContext) {
  return `clinic:pharmacy-links:${encodeURIComponent(context.tenantId)}:${encodeURIComponent(context.subTenantId)}`
}

export async function getPharmacyLinks(context: InventoryContext): Promise<PharmacyPrescriptionLink[]> {
  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase
      .from('pharmacy_links')
      .select('id, prescription_id, doctor_id, tenant_id, sub_tenant_id, pharmacy_id, status, items, created_at')
      .eq('tenant_id', context.tenantId)
      .eq('sub_tenant_id', context.subTenantId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []) as PharmacyPrescriptionLink[]
  }

  const raw = getStorage()?.getItem(getLinksKey(context))
  if (!raw) return []
  try {
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data)) throw new Error('Stored dispense history is not a list.')
    return data as PharmacyPrescriptionLink[]
  } catch (error) {
    throw new Error(`Local demo pharmacy history could not be read: ${error instanceof Error ? error.message : 'Invalid data'}`)
  }
}

export async function dispensePrescription(
  context: InventoryContext,
  request: DispenseRequest,
): Promise<PharmacyPrescriptionLink> {
  if (!request.prescription_id || request.items.length === 0) {
    throw new Error('Select a prescription and at least one medicine to dispense.')
  }
  if (request.items.some((item) => !item.inventory_id || !Number.isSafeInteger(item.quantity) || item.quantity < 1)) {
    throw new Error('Select an inventory item and enter a positive whole-number quantity for every medicine.')
  }

  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase.rpc('dispense_prescription_inventory', {
      p_prescription_id: request.prescription_id,
      p_items: request.items.map((item) => ({
        inventory_id: item.inventory_id,
        name: item.name,
        unit: item.unit,
        quantity: item.quantity,
      })),
    }).single()
    if (error) throw error
    return data as PharmacyPrescriptionLink
  }

  const existing = await getPharmacyLinks(context)
  const alreadyDispensed = existing.find((link) => link.prescription_id === request.prescription_id && link.status === 'dispensed')
  if (alreadyDispensed) return alreadyDispensed

  const inventory = createInventoryAdapter(context)
  const items = await inventory.getItems()
  const quantities = new Map<string, number>()
  for (const line of request.items) {
    const current = items.find((item) => item.id === line.inventory_id)
    if (!current) throw new Error(`Inventory item ${line.inventory_id} is not available.`)
    quantities.set(line.inventory_id!, (quantities.get(line.inventory_id!) || 0) + line.quantity)
  }
  for (const [itemId, quantity] of quantities) {
    const current = items.find((item) => item.id === itemId) as InventoryItem
    if (current.quantity < quantity) throw new Error(`Insufficient stock for ${current.name}.`)
  }

  const adjusted: InventoryItem[] = []
  try {
    for (const [itemId, quantity] of quantities) adjusted.push(await inventory.adjustStock(itemId, -quantity))
  } catch (error) {
    for (const item of adjusted) {
      const original = items.find((candidate) => candidate.id === item.id)
      if (original) await inventory.adjustStock(item.id!, original.quantity - item.quantity)
    }
    throw error
  }

  const link: PharmacyPrescriptionLink = {
    id: `demo-link-${Date.now()}`,
    prescription_id: request.prescription_id,
    doctor_id: request.doctor_id,
    tenant_id: context.tenantId,
    sub_tenant_id: context.subTenantId,
    pharmacy_id: context.userId,
    status: 'dispensed',
    items: request.items.map((line) => ({
      inventory_id: line.inventory_id!,
      name: items.find((item) => item.id === line.inventory_id)?.name,
      quantity: line.quantity,
      unit: line.unit,
    })),
    created_at: new Date().toISOString(),
  }
  getStorage()?.setItem(getLinksKey(context), JSON.stringify([link, ...existing]))
  return link
}
