import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useAuth } from '../services/auth'
import { isTenantModuleEnabled } from '../services/adminManagement'
import { createClientId, db } from '../services/db'
import { createLabOrder, getLabOrders, OperationsContext, updateLabOrder } from '../services/clinicOperations'
import { isSupabaseConfigured } from '../services/supabaseClient'
import { filterTenantRecords } from '../services/tenant'
import { LabOrder, LabOrderStatus, Patient, Visit } from '../types'

const statuses: LabOrderStatus[] = ['requested', 'processing', 'completed', 'cancelled']

export default function LabsPage() {
  const { user } = useAuth()
  const context = useMemo<OperationsContext | undefined>(() => user?.sub_tenant_id ? ({
    tenantId: user.tenant_id,
    subTenantId: user.sub_tenant_id,
    userId: user.id,
  }) : undefined, [user])
  const [patients, setPatients] = useState<Patient[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [orders, setOrders] = useState<LabOrder[]>([])
  const [patientId, setPatientId] = useState('')
  const [visitId, setVisitId] = useState('')
  const [testName, setTestName] = useState('')
  const [notes, setNotes] = useState('')
  const [results, setResults] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const pendingOrderId = useRef<string | null>(null)
  const scopedPatients = useMemo(() => user ? filterTenantRecords(patients, user.scope) : [], [patients, user])
  const patientByRemoteId = useMemo(() => new Map(scopedPatients.flatMap((patient) => [
    [String(patient.id), patient] as const,
    ...(patient.cloud_id ? [[patient.cloud_id, patient] as const] : []),
  ])), [scopedPatients])

  const load = useCallback(async () => {
    if (!user || !context || !isTenantModuleEnabled(user, 'labs')) return
    setLoading(true)
    setError(null)
    try {
      const [allPatients, allVisits, allOrders] = await Promise.all([
        db.patients.toArray(),
        db.visits.toArray(),
        getLabOrders(context),
      ])
      const visiblePatients = filterTenantRecords(allPatients, user.scope)
      const visibleVisits = filterTenantRecords(allVisits, user.scope)
      setPatients(visiblePatients)
      setVisits(visibleVisits)
      setOrders(allOrders)
    } catch (loadError) {
      console.error('Unable to load laboratory orders', loadError)
      setError(loadError instanceof Error ? loadError.message : 'Unable to load laboratory orders.')
    } finally {
      setLoading(false)
    }
  }, [context, user])

  useEffect(() => { void load() }, [load])

  const submitOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!context || !user) return
    const patient = scopedPatients.find((item) => String(item.id) === patientId)
    if (!patient) { setError('Select a patient from this clinic.'); return }
    if (isSupabaseConfigured() && !patient.cloud_id) {
      setError('This patient has not synced to the clinic server. Sync the patient before ordering a lab test.')
      return
    }
    const selectedVisit = visits.find((visit) => String(visit.id) === visitId)
    if (isSupabaseConfigured() && selectedVisit && !selectedVisit.cloud_id) {
      setError('This visit has not synced to the clinic server. Sync the visit before linking a lab order.')
      return
    }
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      await createLabOrder(context, {
        clientId: pendingOrderId.current || (pendingOrderId.current = createClientId()),
        patientId: isSupabaseConfigured() ? patient.cloud_id! : String(patient.id),
        visitId: selectedVisit ? (isSupabaseConfigured() ? selectedVisit.cloud_id : String(selectedVisit.id)) : null,
        testName,
        notes,
      })
      setNotice(`${testName.trim()} order created for ${patient.name}.`)
      setPatientId('')
      setVisitId('')
      setTestName('')
      setNotes('')
      pendingOrderId.current = null
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to create lab order.')
    } finally {
      setSaving(false)
    }
  }

  const changeOrder = async (order: LabOrder, status: LabOrderStatus) => {
    if (!context) return
    const resultText = results[order.id] ?? order.result_text ?? ''
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      await updateLabOrder(context, order.id, {
        status,
        ...(status === 'completed' || resultText ? { result_text: resultText } : {}),
      })
      setNotice(`Lab order ${status === 'completed' ? 'marked complete' : `updated to ${status}`}.`)
      await load()
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update lab order.')
    } finally {
      setSaving(false)
    }
  }

  const saveResult = async (order: LabOrder) => {
    if (!context) return
    const resultText = results[order.id] ?? order.result_text ?? ''
    setSaving(true)
    setError(null)
    try {
      await updateLabOrder(context, order.id, { result_text: resultText })
      setNotice('Lab result saved.')
      await load()
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to save lab result.')
    } finally {
      setSaving(false)
    }
  }

  if (!isTenantModuleEnabled(user, 'labs')) return <div className="soft-card mx-auto max-w-xl p-6 text-slate-600">Laboratory module is not enabled for this clinic. Contact your platform owner.</div>
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Clinic operations</p><h1 className="mt-1 text-3xl font-bold text-slate-900">Laboratory</h1><p className="mt-1 text-sm text-slate-600">Create patient lab orders, track processing, and save results.</p></div>
        <div className="flex items-center gap-2">{!isSupabaseConfigured() && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">Demo data · this browser only</span>}<button type="button" onClick={() => void load()} disabled={loading || saving} className="action-button-secondary"><RefreshCw className="mr-2 h-4 w-4" />Refresh</button></div>
      </header>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}

      <section className="soft-card p-5">
        <h2 className="font-semibold text-slate-900">Request a laboratory test</h2>
        <form onSubmit={submitOrder} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label><span className="field-label">Patient</span><select required className="field-input" value={patientId} onChange={(event) => { setPatientId(event.target.value); setVisitId('') }}><option value="">Select patient</option>{scopedPatients.map((patient) => <option key={patient.id} value={String(patient.id)}>{patient.name} · {patient.phone || patient.hospital_id || patient.id}</option>)}</select></label>
          <label><span className="field-label">Related visit (optional)</span><select className="field-input" value={visitId} onChange={(event) => setVisitId(event.target.value)}><option value="">No linked visit</option>{visits.filter((visit) => String(visit.patient_id) === patientId).map((visit) => <option key={visit.id} value={String(visit.id)}>{visit.specialty || visit.visit_type || 'Visit'} · {visit.created_at ? new Date(visit.created_at).toLocaleDateString() : visit.id}</option>)}</select></label>
          <label><span className="field-label">Test name</span><input required maxLength={160} className="field-input" value={testName} onChange={(event) => setTestName(event.target.value)} placeholder="e.g. Complete blood count" /></label>
          <label><span className="field-label">Clinical note / specimen details</span><input maxLength={500} className="field-input" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          <div className="sm:col-span-2"><button type="submit" disabled={saving || !scopedPatients.length} className="action-button-primary">{saving ? 'Saving...' : 'Create lab order'}</button></div>
        </form>
      </section>

      <section className="soft-card overflow-hidden">
        <div className="border-b border-slate-200 p-4"><h2 className="font-semibold text-slate-900">Lab orders and results</h2></div>
        {loading ? <p className="p-5 text-sm text-slate-500">Loading lab orders...</p> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Patient / test</th><th className="px-4 py-3">Order note</th><th className="px-4 py-3">Result</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{orders.map((order) => <tr key={order.id} className="align-top"><td className="px-4 py-3"><span className="font-medium">{patientByRemoteId.get(order.patient_id)?.name || 'Patient record'}</span><span className="block text-xs text-slate-500">{order.test_name} · {new Date(order.created_at).toLocaleString()}</span></td><td className="px-4 py-3">{order.notes || '—'}</td><td className="min-w-64 px-4 py-3"><textarea aria-label={`Result for ${order.test_name}`} className="field-textarea" rows={2} disabled={order.status === 'cancelled'} value={results[order.id] ?? order.result_text ?? ''} onChange={(event) => setResults((current) => ({ ...current, [order.id]: event.target.value }))} /><button type="button" disabled={saving || order.status === 'cancelled'} onClick={() => void saveResult(order)} className="mt-1 text-xs font-medium text-sky-700">Save result</button></td><td className="px-4 py-3"><span className="capitalize">{order.status}</span></td><td className="px-4 py-3"><div className="flex min-w-40 flex-col gap-2"><select aria-label={`Status for ${order.test_name}`} disabled={saving || order.status === 'cancelled'} className="field-input" value={order.status} onChange={(event) => void changeOrder(order, event.target.value as LabOrderStatus)}>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select>{order.status !== 'completed' && order.status !== 'cancelled' && <button type="button" disabled={saving || !(results[order.id] ?? order.result_text)?.trim()} onClick={() => void changeOrder(order, 'completed')} className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 disabled:opacity-50">Save result & complete</button>}</div></td></tr>)}{!orders.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No lab orders yet.</td></tr>}</tbody></table></div>}
      </section>
    </div>
  )
}
