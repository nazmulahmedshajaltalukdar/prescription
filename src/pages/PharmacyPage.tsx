import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useAuth } from '../services/auth'
import { isTenantModuleEnabled } from '../services/adminManagement'
import { db } from '../services/db'
import { InventoryContext, createInventoryAdapter } from '../services/inventory'
import { dispensePrescription, getPharmacyLinks } from '../services/pharmacy'
import { isSupabaseConfigured } from '../services/supabaseClient'
import { filterTenantRecords } from '../services/tenant'
import { InventoryItem, PharmacyPrescriptionLink, Prescription, Visit } from '../types'

interface DispenseLine {
  inventory_id: string
  quantity: number
}

export default function PharmacyPage() {
  const { user } = useAuth()
  const context = useMemo<InventoryContext | undefined>(() => user?.sub_tenant_id ? ({
    tenantId: user.tenant_id,
    subTenantId: user.sub_tenant_id,
    userId: user.id,
  }) : undefined, [user])
  const inventoryAdapter = useMemo(() => context ? createInventoryAdapter(context) : null, [context])
  const [items, setItems] = useState<InventoryItem[]>([])
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [links, setLinks] = useState<PharmacyPrescriptionLink[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [lines, setLines] = useState<DispenseLine[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const visitMap = useMemo(() => new Map(visits.map((visit) => [String(visit.id), visit])), [visits])
  const prescription = prescriptions.find((item) => String(item.id) === selectedId)

  const load = useCallback(async () => {
    if (!user || !context || !inventoryAdapter || !isTenantModuleEnabled(user, 'pharmacy') || !isTenantModuleEnabled(user, 'inventory')) return
    setLoading(true)
    setError(null)
    try {
      const [allPrescriptions, allVisits, inventory, dispenseHistory] = await Promise.all([
        db.prescriptions.toArray(),
        db.visits.toArray(),
        inventoryAdapter.getItems(),
        getPharmacyLinks(context),
      ])
      setPrescriptions(filterTenantRecords(allPrescriptions, user.scope))
      setVisits(filterTenantRecords(allVisits, user.scope))
      setItems(inventory)
      setLinks(dispenseHistory)
    } catch (loadError) {
      console.error('Unable to load pharmacy workflow', loadError)
      setError(loadError instanceof Error ? loadError.message : 'Unable to load pharmacy workflow.')
    } finally {
      setLoading(false)
    }
  }, [context, inventoryAdapter, user])

  useEffect(() => { void load() }, [load])

  const selectPrescription = (id: string) => {
    setSelectedId(id)
    const selected = prescriptions.find((item) => String(item.id) === id)
    const nextLines = (selected?.items || []).map((medicine) => {
      const name = medicine.brand || medicine.generic || ''
      const match = items.find((item) => item.name.toLowerCase() === name.toLowerCase())
      return { inventory_id: match?.id || '', quantity: 1 }
    })
    setLines(nextLines)
  }

  const submitDispense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!user || !context || !prescription) return
    const remotePrescriptionId = isSupabaseConfigured() ? prescription.cloud_id : String(prescription.id)
    if (!remotePrescriptionId) {
      setError('Prescription has not synced to the clinic server yet. Connect and sync the prescription before dispensing.')
      return
    }
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const result = await dispensePrescription(context, {
        prescription_id: remotePrescriptionId,
        doctor_id: prescription.doctor_id,
        items: lines.map((line) => ({
          inventory_id: line.inventory_id,
          name: items.find((item) => item.id === line.inventory_id)?.name || '',
          unit: items.find((item) => item.id === line.inventory_id)?.unit,
          quantity: line.quantity,
        })),
      })
      setNotice(result.status === 'dispensed' ? 'Prescription dispensed and inventory updated atomically.' : 'Dispensing recorded.')
      setSelectedId('')
      setLines([])
      await load()
    } catch (dispenseError) {
      setError(dispenseError instanceof Error ? dispenseError.message : 'Unable to dispense this prescription.')
    } finally {
      setSaving(false)
    }
  }

  if (!isTenantModuleEnabled(user, 'pharmacy') || !isTenantModuleEnabled(user, 'inventory')) {
    return <div className="soft-card mx-auto max-w-xl p-6 text-slate-600">Pharmacy dispensing requires both the pharmacy and inventory modules. Contact your platform owner to enable them.</div>
  }

  const alreadyDispensed = prescription && links.some((link) =>
    link.prescription_id === (isSupabaseConfigured() ? prescription.cloud_id : String(prescription.id)) && link.status === 'dispensed',
  )
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Clinic operations</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Pharmacy dispensing</h1>
          <p className="mt-1 text-sm text-slate-600">Dispensing deducts available stock in one transaction and prevents duplicate dispensing.</p>
        </div>
        <div className="flex items-center gap-2">
          {!isSupabaseConfigured() && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">Demo data · this browser only</span>}
          <button type="button" onClick={() => void load()} disabled={loading || saving} className="action-button-secondary"><RefreshCw className="mr-2 h-4 w-4" />Refresh</button>
        </div>
      </header>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}

      <section className="soft-card p-5">
        <h2 className="font-semibold text-slate-900">Dispense a prescription</h2>
        {loading ? <p className="mt-3 text-sm text-slate-500">Loading prescriptions and stock...</p> : (
          <>
            <label className="mt-4 block max-w-2xl"><span className="field-label">Prescription record</span><select className="field-input" value={selectedId} onChange={(event) => selectPrescription(event.target.value)}><option value="">Select prescription</option>{prescriptions.map((item) => <option key={item.id} value={String(item.id)}>RX {item.cloud_id || item.id} · {visitMap.get(String(item.visit_id))?.created_at ? new Date(visitMap.get(String(item.visit_id))!.created_at!).toLocaleDateString() : 'Visit'}{links.some((link) => link.prescription_id === (isSupabaseConfigured() ? item.cloud_id : String(item.id)) && link.status === 'dispensed') ? ' · Dispensed' : ''}</option>)}</select></label>
            {prescription && <form onSubmit={submitDispense} className="mt-4 space-y-4">
              <div className="divide-y rounded-xl border border-slate-200">
                {prescription.items.map((medicine, index) => {
                  const displayName = medicine.brand || medicine.generic || `Medicine ${index + 1}`
                  return <div key={`${displayName}-${index}`} className="grid gap-3 p-4 sm:grid-cols-[1fr_2fr_8rem] sm:items-end">
                    <div><p className="font-medium text-slate-900">{displayName}</p><p className="text-xs text-slate-500">{medicine.dose || 'Dose not recorded'} · {medicine.frequency || 'Frequency not recorded'} · {medicine.duration || 'Duration not recorded'}</p></div>
                    <label><span className="field-label">Inventory item</span><select required className="field-input" value={lines[index]?.inventory_id || ''} onChange={(event) => setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, inventory_id: event.target.value } : line))}><option value="">Select stock item</option>{items.map((item) => <option key={item.id} value={item.id} disabled={item.quantity < 1}>{item.name} · in stock {item.quantity}</option>)}</select></label>
                    <label><span className="field-label">Quantity</span><input required min="1" step="1" type="number" className="field-input" value={lines[index]?.quantity || 1} onChange={(event) => setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, quantity: Number(event.target.value) } : line))} /></label>
                  </div>
                })}
              </div>
              <button type="submit" disabled={saving || alreadyDispensed || !lines.length} className="action-button-primary">{saving ? 'Dispensing...' : alreadyDispensed ? 'Already dispensed' : 'Confirm dispense'}</button>
            </form>}
          </>
        )}
      </section>

      <section className="soft-card overflow-hidden">
        <div className="border-b border-slate-200 p-4"><h2 className="font-semibold text-slate-900">Dispensing history</h2></div>
        <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Prescription</th><th className="px-4 py-3">Medicines</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Dispensed at</th></tr></thead><tbody className="divide-y divide-slate-100">{links.map((link) => <tr key={link.id}><td className="px-4 py-3">{link.prescription_id}</td><td className="px-4 py-3">{link.items?.map((item) => `${item.name || item.inventory_id} × ${item.quantity}`).join(', ') || '—'}</td><td className="px-4 py-3 capitalize">{link.status}</td><td className="px-4 py-3">{link.created_at ? new Date(link.created_at).toLocaleString() : '—'}</td></tr>)}{!links.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">No dispensing records yet.</td></tr>}</tbody></table></div>
      </section>
    </div>
  )
}
