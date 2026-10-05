import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { InventoryItem } from '../types'
import { createInventoryAdapter, InventoryContext } from '../services/inventory'
import { isSupabaseConfigured } from '../services/supabaseClient'
import { useAuth } from '../services/auth'
import { isTenantModuleEnabled } from '../services/adminManagement'

const emptyItem = { name: '', sku: '', quantity: 0, low_stock_threshold: 0, unit: 'unit', batch: '', location: '', supplier: '' }

export default function InventoryPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [form, setForm] = useState(emptyItem)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const context = useMemo<InventoryContext | undefined>(() => user?.sub_tenant_id ? ({
    tenantId: user.tenant_id,
    subTenantId: user.sub_tenant_id,
    userId: user.id,
  }) : undefined, [user])
  const adapter = useMemo(() => context ? createInventoryAdapter(context) : null, [context])

  const load = useCallback(async () => {
    if (!adapter || !isTenantModuleEnabled(user, 'inventory')) return
    setLoading(true)
    setError(null)
    try {
      setItems(await adapter.getItems())
    } catch (loadError) {
      console.error('Unable to load inventory', loadError)
      setError(loadError instanceof Error ? loadError.message : 'Unable to load inventory.')
    } finally {
      setLoading(false)
    }
  }, [adapter, user])

  useEffect(() => { void load() }, [load])

  const saveItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!adapter) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      await adapter.createItem(form)
      setForm(emptyItem)
      setNotice('Inventory item added.')
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to add inventory item.')
    } finally {
      setSaving(false)
    }
  }

  const adjustStock = async (item: InventoryItem, delta: number) => {
    if (!adapter || !item.id) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      await adapter.adjustStock(item.id, delta)
      await load()
    } catch (stockError) {
      setError(stockError instanceof Error ? stockError.message : 'Unable to adjust inventory.')
    } finally {
      setSaving(false)
    }
  }

  if (!isTenantModuleEnabled(user, 'inventory')) {
    return <div className="soft-card mx-auto max-w-xl p-6 text-slate-600">Inventory module is not enabled for this clinic. Contact your platform owner.</div>
  }

  const lowStock = items.filter((item) => item.quantity <= (item.low_stock_threshold ?? 0)).length
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Clinic operations</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Pharmacy inventory</h1>
          <p className="mt-1 text-sm text-slate-600">Track medicine stock for this clinic location.</p>
        </div>
        <div className="flex items-center gap-2">
          {!isSupabaseConfigured() && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">Demo data · this browser only</span>}
          <button type="button" onClick={() => void load()} disabled={loading || saving} className="action-button-secondary"><RefreshCw className="mr-2 h-4 w-4" />Refresh</button>
        </div>
      </header>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="soft-card p-4"><p className="text-sm text-slate-500">Medicine items</p><p className="mt-2 text-3xl font-bold">{items.length}</p></div>
        <div className="soft-card p-4"><p className="text-sm text-slate-500">Low stock</p><p className="mt-2 text-3xl font-bold">{lowStock}</p></div>
        <div className="soft-card p-4"><p className="text-sm text-slate-500">Scope</p><p className="mt-2 break-all text-sm font-semibold">{user?.sub_tenant_id}</p></div>
      </section>

      <section className="soft-card p-5">
        <h2 className="font-semibold text-slate-900">Add medicine stock</h2>
        <form onSubmit={saveItem} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label><span className="field-label">Medicine name</span><input className="field-input" required maxLength={160} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label><span className="field-label">SKU / code</span><input className="field-input" maxLength={64} value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} /></label>
          <label><span className="field-label">Batch</span><input className="field-input" maxLength={80} value={form.batch} onChange={(event) => setForm({ ...form, batch: event.target.value })} /></label>
          <label><span className="field-label">Starting quantity</span><input className="field-input" type="number" min="0" step="1" required value={form.quantity} onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })} /></label>
          <label><span className="field-label">Low-stock threshold</span><input className="field-input" type="number" min="0" step="1" value={form.low_stock_threshold} onChange={(event) => setForm({ ...form, low_stock_threshold: Number(event.target.value) })} /></label>
          <label><span className="field-label">Unit</span><input className="field-input" maxLength={40} value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} /></label>
          <label><span className="field-label">Shelf / location</span><input className="field-input" maxLength={100} value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></label>
          <label><span className="field-label">Supplier</span><input className="field-input" maxLength={120} value={form.supplier} onChange={(event) => setForm({ ...form, supplier: event.target.value })} /></label>
          <div className="sm:col-span-2 lg:col-span-4"><button type="submit" disabled={saving} className="action-button-primary"><Plus className="mr-2 h-4 w-4" />{saving ? 'Saving...' : 'Add stock item'}</button></div>
        </form>
      </section>

      <section className="soft-card overflow-hidden">
        <div className="border-b border-slate-200 p-4"><h2 className="font-semibold text-slate-900">Stock on hand</h2></div>
        {loading ? <p className="p-5 text-sm text-slate-500">Loading inventory...</p> : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Medicine</th><th className="px-4 py-3">Batch / SKU</th><th className="px-4 py-3">Quantity</th><th className="px-4 py-3">Threshold</th><th className="px-4 py-3">Shelf / Supplier</th><th className="px-4 py-3">Adjust</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => <tr key={item.id} className={item.quantity <= (item.low_stock_threshold ?? 0) ? 'bg-amber-50' : ''}>
                  <td className="px-4 py-3 font-medium">{item.name}<span className="ml-2 text-xs text-slate-500">{item.unit}</span></td>
                  <td className="px-4 py-3 text-slate-600">{item.batch || '—'} / {item.sku || '—'}</td>
                  <td className="px-4 py-3 font-semibold">{item.quantity}</td>
                  <td className="px-4 py-3">{item.low_stock_threshold ?? 0}</td>
                  <td className="px-4 py-3 text-slate-600">{item.location || '—'} / {item.supplier || '—'}</td>
                  <td className="px-4 py-3"><div className="flex gap-2"><button type="button" disabled={saving} onClick={() => void adjustStock(item, -1)} className="rounded border px-2 py-1" aria-label={`Remove one ${item.name}`}>−1</button><button type="button" disabled={saving} onClick={() => void adjustStock(item, 1)} className="rounded border px-2 py-1" aria-label={`Add one ${item.name}`}>+1</button></div></td>
                </tr>)}
                {!items.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No inventory items yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
