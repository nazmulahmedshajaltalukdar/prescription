import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { useAuth } from '../services/auth'
import { isTenantModuleEnabled } from '../services/adminManagement'
import { db, createClientId } from '../services/db'
import { calculateInvoiceTotals, createInvoice, getInvoices, InvoiceLine, recordInvoicePayment, OperationsContext } from '../services/clinicOperations'
import { isSupabaseConfigured } from '../services/supabaseClient'
import { filterTenantRecords } from '../services/tenant'
import { BillingInvoice, Patient, PaymentMethod, Visit } from '../types'

const paymentMethods: PaymentMethod[] = ['cash', 'card', 'mobile_money', 'bank_transfer', 'other']

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT' }).format(value)
}

export default function BillingPage() {
  const { user } = useAuth()
  const context = useMemo<OperationsContext | undefined>(() => user?.sub_tenant_id ? ({
    tenantId: user.tenant_id,
    subTenantId: user.sub_tenant_id,
    userId: user.id,
  }) : undefined, [user])
  const [patients, setPatients] = useState<Patient[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [invoices, setInvoices] = useState<BillingInvoice[]>([])
  const [patientId, setPatientId] = useState('')
  const [visitId, setVisitId] = useState('')
  const [description, setDescription] = useState('Consultation')
  const [lineItems, setLineItems] = useState<InvoiceLine[]>([{ description: 'Consultation', quantity: 1, unit_price: 0 }])
  const [discount, setDiscount] = useState(0)
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, string>>({})
  const [paymentMethodsByInvoice, setPaymentMethodsByInvoice] = useState<Record<string, PaymentMethod>>({})
  const [paymentKeys, setPaymentKeys] = useState<Record<string, string>>({})
  const pendingInvoice = useRef<{ clientId: string; invoiceNo: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const scopedPatients = useMemo(() => user ? filterTenantRecords(patients, user.scope) : [], [patients, user])
  const patientById = useMemo(() => new Map(scopedPatients.map((patient) => [String(patient.id), patient])), [scopedPatients])
  const totals = useMemo(() => {
    try { return calculateInvoiceTotals(lineItems, discount) } catch { return null }
  }, [lineItems, discount])

  const load = useCallback(async () => {
    if (!user || !context || !isTenantModuleEnabled(user, 'billing')) return
    setLoading(true)
    setError(null)
    try {
      const [allPatients, allVisits, allInvoices] = await Promise.all([
        db.patients.toArray(),
        db.visits.toArray(),
        getInvoices(context),
      ])
      const visiblePatients = filterTenantRecords(allPatients, user.scope)
      const visibleVisits = filterTenantRecords(allVisits, user.scope)
      setPatients(visiblePatients)
      setVisits(visibleVisits)
      setInvoices(allInvoices.map((invoice) => {
        const patient = visiblePatients.find((item) => item.cloud_id === invoice.patient_id || String(item.id) === invoice.patient_id)
        return { ...invoice, patient_name: patient?.name || 'Patient record' }
      }))
    } catch (loadError) {
      console.error('Unable to load billing records', loadError)
      setError(loadError instanceof Error ? loadError.message : 'Unable to load billing records.')
    } finally {
      setLoading(false)
    }
  }, [context, user])

  useEffect(() => { void load() }, [load])

  const submitInvoice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!context || !user) return
    const patient = patientById.get(patientId)
    if (!patient) { setError('Select a patient from this clinic.'); return }
    if (isSupabaseConfigured() && !patient.cloud_id) {
      setError('This patient has not synced to the clinic server. Sync the patient before creating an invoice.')
      return
    }
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const request = pendingInvoice.current || (() => {
        const clientId = createClientId()
        const next = {
          clientId,
          invoiceNo: `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${clientId.slice(0, 6).toUpperCase()}`,
        }
        pendingInvoice.current = next
        return next
      })()
      const invoice = await createInvoice(context, {
        clientId: request.clientId,
        invoiceNo: request.invoiceNo,
        patientId: isSupabaseConfigured() ? patient.cloud_id! : String(patient.id),
        visitId: visitId ? (isSupabaseConfigured() ? visits.find((visit) => String(visit.id) === visitId)?.cloud_id : visitId) || null : null,
        description,
        items: lineItems,
        discount,
      })
      setNotice(`Invoice ${invoice.invoice_no} created for ${formatMoney(invoice.total)}.`)
      pendingInvoice.current = null
      setPatientId('')
      setVisitId('')
      setDescription('Consultation')
      setLineItems([{ description: 'Consultation', quantity: 1, unit_price: 0 }])
      setDiscount(0)
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to create the invoice.')
    } finally {
      setSaving(false)
    }
  }

  const submitPayment = async (event: FormEvent<HTMLFormElement>, invoice: BillingInvoice) => {
    event.preventDefault()
    if (!context) return
    const amount = Number(paymentAmounts[invoice.id])
    const clientId = paymentKeys[invoice.id] || createClientId()
    setSaving(true)
    setError(null)
    setNotice(null)
    setPaymentKeys((current) => ({ ...current, [invoice.id]: clientId }))
    try {
      const updated = await recordInvoicePayment(
        context,
        invoice.id,
        amount,
        paymentMethodsByInvoice[invoice.id] || 'cash',
        clientId,
      )
      setNotice(`Payment saved. Remaining balance: ${formatMoney(updated.total - updated.paid_amount)}.`)
      setPaymentAmounts((current) => ({ ...current, [invoice.id]: '' }))
      setPaymentKeys((current) => {
        const next = { ...current }
        delete next[invoice.id]
        return next
      })
      await load()
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : 'Unable to record payment.')
    } finally {
      setSaving(false)
    }
  }

  if (!isTenantModuleEnabled(user, 'billing')) return <div className="soft-card mx-auto max-w-xl p-6 text-slate-600">Billing module is not enabled for this clinic. Contact your platform owner.</div>
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Clinic operations</p><h1 className="mt-1 text-3xl font-bold text-slate-900">Billing</h1><p className="mt-1 text-sm text-slate-600">Create patient invoices and record partial or full payments in BDT.</p></div>
        <div className="flex items-center gap-2">{!isSupabaseConfigured() && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">Demo data · this browser only</span>}<button type="button" onClick={() => void load()} disabled={loading || saving} className="action-button-secondary"><RefreshCw className="mr-2 h-4 w-4" />Refresh</button></div>
      </header>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}

      <section className="soft-card p-5">
        <h2 className="font-semibold text-slate-900">Create invoice</h2>
        <form onSubmit={submitInvoice} className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className="field-label">Patient</span><select required className="field-input" value={patientId} onChange={(event) => { setPatientId(event.target.value); setVisitId('') }}><option value="">Select patient</option>{scopedPatients.map((patient) => <option key={patient.id} value={String(patient.id)}>{patient.name} · {patient.phone || patient.hospital_id || patient.id}</option>)}</select></label>
            <label><span className="field-label">Related visit (optional)</span><select className="field-input" value={visitId} onChange={(event) => setVisitId(event.target.value)}><option value="">No linked visit</option>{visits.filter((visit) => String(visit.patient_id) === patientId).map((visit) => <option key={visit.id} value={String(visit.id)}>{visit.specialty || visit.visit_type || 'Visit'} · {visit.created_at ? new Date(visit.created_at).toLocaleDateString() : visit.id}</option>)}</select></label>
          </div>
          <label className="block"><span className="field-label">Invoice note</span><input required className="field-input" maxLength={180} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <div className="space-y-2">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-800">Invoice lines</h3><button type="button" onClick={() => setLineItems((current) => [...current, { description: '', quantity: 1, unit_price: 0 }])} className="action-button-secondary"><Plus className="mr-1 h-4 w-4" />Add line</button></div>
            {lineItems.map((line, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr_8rem_10rem_auto]">
              <input required maxLength={160} aria-label={`Line ${index + 1} description`} className="field-input" placeholder="Service or item" value={line.description} onChange={(event) => setLineItems((current) => current.map((item, i) => i === index ? { ...item, description: event.target.value } : item))} />
              <input required min="1" step="1" type="number" aria-label={`Line ${index + 1} quantity`} className="field-input" value={line.quantity} onChange={(event) => setLineItems((current) => current.map((item, i) => i === index ? { ...item, quantity: Number(event.target.value) } : item))} />
              <input required min="0" step="0.01" type="number" aria-label={`Line ${index + 1} unit price`} className="field-input" placeholder="Unit price (BDT)" value={line.unit_price} onChange={(event) => setLineItems((current) => current.map((item, i) => i === index ? { ...item, unit_price: Number(event.target.value) } : item))} />
              <button type="button" disabled={lineItems.length < 2} onClick={() => setLineItems((current) => current.filter((_, i) => i !== index))} className="rounded-lg border px-3 text-sm text-rose-700 disabled:opacity-40">Remove</button>
            </div>)}
          </div>
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr]">
            <label><span className="field-label">Discount (BDT)</span><input type="number" min="0" step="0.01" className="field-input" value={discount} onChange={(event) => setDiscount(Number(event.target.value))} /></label>
            <div><span className="field-label">Subtotal</span><p className="py-2 font-semibold">{formatMoney(totals?.subtotal || 0)}</p></div>
            <div><span className="field-label">Total due</span><p className="py-2 text-lg font-bold">{formatMoney(totals?.total || 0)}</p></div>
          </div>
          <button type="submit" disabled={saving || !totals || !scopedPatients.length} className="action-button-primary">{saving ? 'Saving...' : 'Create invoice'}</button>
        </form>
      </section>

      <section className="soft-card overflow-hidden">
        <div className="border-b border-slate-200 p-4"><h2 className="font-semibold text-slate-900">Invoices</h2></div>
        {loading ? <p className="p-5 text-sm text-slate-500">Loading invoices...</p> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Invoice / patient</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Total / paid</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Record payment</th></tr></thead><tbody className="divide-y divide-slate-100">{invoices.map((invoice) => <tr key={invoice.id} className="align-top"><td className="px-4 py-3"><span className="font-semibold">{invoice.invoice_no}</span><span className="block text-xs text-slate-500">{invoice.patient_name} · {new Date(invoice.created_at).toLocaleDateString()}</span></td><td className="px-4 py-3">{invoice.description}<span className="block text-xs text-slate-500">{invoice.items.map((item) => `${item.description} × ${item.quantity}`).join(', ')}</span></td><td className="px-4 py-3">{formatMoney(invoice.total)}<span className="block text-xs text-slate-500">Paid {formatMoney(invoice.paid_amount)}</span></td><td className="px-4 py-3 capitalize">{invoice.status.replace('_', ' ')}</td><td className="min-w-72 px-4 py-3">{invoice.status !== 'paid' && invoice.status !== 'cancelled' && <form onSubmit={(event) => void submitPayment(event, invoice)} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><input required min="0.01" max={(invoice.total - invoice.paid_amount).toFixed(2)} step="0.01" type="number" aria-label={`Payment amount for ${invoice.invoice_no}`} className="field-input" placeholder="Amount" disabled={Boolean(paymentKeys[invoice.id])} value={paymentAmounts[invoice.id] || ''} onChange={(event) => setPaymentAmounts((current) => ({ ...current, [invoice.id]: event.target.value }))} /><select aria-label={`Payment method for ${invoice.invoice_no}`} className="field-input" disabled={Boolean(paymentKeys[invoice.id])} value={paymentMethodsByInvoice[invoice.id] || 'cash'} onChange={(event) => setPaymentMethodsByInvoice((current) => ({ ...current, [invoice.id]: event.target.value as PaymentMethod }))}>{paymentMethods.map((method) => <option key={method} value={method}>{method.replace('_', ' ')}</option>)}</select><button type="submit" disabled={saving} className="action-button-primary">{paymentKeys[invoice.id] ? 'Retry same payment' : 'Pay'}</button></form>}</td></tr>)}{!invoices.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No invoices yet.</td></tr>}</tbody></table></div>}
      </section>
    </div>
  )
}
