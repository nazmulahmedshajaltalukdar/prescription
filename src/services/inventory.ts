import { InventoryAdapter, InventoryItem } from '../types'
import { getStorage } from './storage'
import { isSupabaseConfigured, supabase } from './supabaseClient'

export interface InventoryContext {
  tenantId: string
  subTenantId: string
  userId: string
}

const seedItems: InventoryItem[] = [
  {
    id: 'demo-napa-500',
    name: 'Napa 500mg',
    sku: 'NAPA-500',
    quantity: 18,
    low_stock_threshold: 20,
    unit: 'strip',
    location: 'Rack A1',
    supplier: 'Demo supplier',
  },
  {
    id: 'demo-amoxicillin-500',
    name: 'Amoxicillin 500mg',
    sku: 'AMOX-500',
    quantity: 7,
    low_stock_threshold: 10,
    unit: 'strip',
    location: 'Rack B2',
    supplier: 'Demo supplier',
  },
]

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function requireContext(context?: InventoryContext): InventoryContext {
  if (!context?.tenantId || !context.subTenantId || !context.userId) {
    throw new Error('A signed-in clinic location is required for inventory operations.')
  }
  return context
}

export class LocalInventoryAdapter implements InventoryAdapter {
  private readonly context: InventoryContext
  private readonly storageKey: string

  constructor(context: InventoryContext = { tenantId: 'tenant-demo', subTenantId: 'clinic-demo', userId: 'demo-user' }) {
    this.context = context
    this.storageKey = `clinic:inventory:${encodeURIComponent(context.tenantId)}:${encodeURIComponent(context.subTenantId)}`
  }

  async getItems() {
    const storage = getStorage()
    if (!storage) return seedItems.map((item) => ({ ...item }))
    const raw = storage.getItem(this.storageKey)
    if (raw) {
      try {
        const items = JSON.parse(raw)
        if (!Array.isArray(items)) throw new Error('Stored inventory is not a list.')
        return items as InventoryItem[]
      } catch (error) {
        throw new Error(`Local demo inventory could not be read: ${error instanceof Error ? error.message : 'Invalid data'}`)
      }
    }

    const initialItems = seedItems.map((item) => ({
      ...item,
      tenant_id: this.context.tenantId,
      sub_tenant_id: this.context.subTenantId,
    }))
    storage.setItem(this.storageKey, JSON.stringify(initialItems))
    return initialItems
  }

  async getLowStockItems() {
    const items = await this.getItems()
    return items.filter((item) => item.quantity <= (item.low_stock_threshold ?? 0))
  }

  async createItem(item: Omit<InventoryItem, 'id'>) {
    if (!item.name.trim() || !Number.isSafeInteger(item.quantity) || item.quantity < 0) {
      throw new Error('Enter a medicine name and a non-negative whole-number quantity.')
    }
    const items = await this.getItems()
    const next: InventoryItem = {
      ...item,
      name: item.name.trim(),
      id: makeId(),
      tenant_id: this.context.tenantId,
      sub_tenant_id: this.context.subTenantId,
      last_updated: new Date().toISOString(),
    }
    const nextItems = [...items, next]
    getStorage()?.setItem(this.storageKey, JSON.stringify(nextItems))
    return next
  }

  async adjustStock(itemId: string, delta: number) {
    if (!Number.isSafeInteger(delta) || delta === 0) throw new Error('Enter a non-zero whole-number stock adjustment.')
    const items = await this.getItems()
    const current = items.find((item) => item.id === itemId)
    if (!current) throw new Error('Inventory item not found.')
    const quantity = current.quantity + delta
    if (quantity < 0) throw new Error('Stock adjustment would make quantity negative.')
    const updated = { ...current, quantity, last_updated: new Date().toISOString() }
    const nextItems = items.map((item) => item.id === itemId ? updated : item)
    getStorage()?.setItem(this.storageKey, JSON.stringify(nextItems))
    return updated
  }
}

export class SupabaseInventoryAdapter implements InventoryAdapter {
  private readonly context: InventoryContext

  constructor(context: InventoryContext) {
    this.context = requireContext(context)
    if (!supabase) throw new Error('Supabase inventory is not configured.')
  }

  async getItems() {
    const { data, error } = await supabase!
      .from('inventory')
      .select('id, tenant_id, sub_tenant_id, name, sku, batch, quantity, low_stock_threshold, unit, location, supplier, last_updated, updated_by')
      .eq('tenant_id', this.context.tenantId)
      .eq('sub_tenant_id', this.context.subTenantId)
      .order('name')
    if (error) throw error
    return (data || []).map((row) => ({ ...row, quantity: row.quantity ?? 0 })) as InventoryItem[]
  }

  async getLowStockItems() {
    const items = await this.getItems()
    return items.filter((item) => item.quantity <= (item.low_stock_threshold ?? 0))
  }

  async createItem(item: Omit<InventoryItem, 'id'>) {
    if (!item.name.trim() || !Number.isSafeInteger(item.quantity) || item.quantity < 0) {
      throw new Error('Enter a medicine name and a non-negative whole-number quantity.')
    }
    const { data, error } = await supabase!
      .from('inventory')
      .insert({
        name: item.name.trim(),
        sku: item.sku?.trim() || null,
        batch: item.batch?.trim() || null,
        quantity: item.quantity,
        low_stock_threshold: item.low_stock_threshold ?? 0,
        unit: item.unit?.trim() || 'unit',
        location: item.location?.trim() || null,
        supplier: item.supplier?.trim() || null,
        tenant_id: this.context.tenantId,
        sub_tenant_id: this.context.subTenantId,
        updated_by: this.context.userId,
        last_updated: new Date().toISOString(),
      })
      .select('*')
      .single()
    if (error) throw error
    return data as InventoryItem
  }

  async adjustStock(itemId: string, delta: number) {
    if (!Number.isSafeInteger(delta) || delta === 0) throw new Error('Enter a non-zero whole-number stock adjustment.')
    const { data, error } = await supabase!.rpc('adjust_inventory_stock', {
      p_inventory_id: itemId,
      p_delta: delta,
      p_reason: 'inventory page adjustment',
    }).single()
    if (error) throw error
    return data as InventoryItem
  }
}

export function createInventoryAdapter(context?: InventoryContext, adapter?: InventoryAdapter): InventoryAdapter {
  if (adapter) return adapter
  if (!context) return new LocalInventoryAdapter()
  if (isSupabaseConfigured()) return new SupabaseInventoryAdapter(requireContext(context))
  return new LocalInventoryAdapter(context)
}

export async function getInventorySnapshot(context?: InventoryContext) {
  const adapter = createInventoryAdapter(context)
  const items = await adapter.getItems()
  return { items, lowStock: items.filter((item) => item.quantity <= (item.low_stock_threshold ?? 0)) }
}
