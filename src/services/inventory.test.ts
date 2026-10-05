import { describe, expect, it } from 'vitest'
import { LocalInventoryAdapter, createInventoryAdapter } from './inventory'

describe('inventory adapter', () => {
  it('creates a local adapter by default', () => {
    const adapter = createInventoryAdapter()
    expect(adapter).toBeInstanceOf(LocalInventoryAdapter)
  })

  it('returns low stock items from default seed data', async () => {
    const adapter = createInventoryAdapter()
    const items = await adapter.getItems()
    const lowStock = await adapter.getLowStockItems()

    expect(items.length).toBeGreaterThan(0)
    expect(lowStock.length).toBeGreaterThanOrEqual(0)
    expect(lowStock.every((item) => item.quantity <= (item.low_stock_threshold ?? 0))).toBe(true)
  })
})
