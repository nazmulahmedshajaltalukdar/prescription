import React, { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Check,
  Clock3,
  Link2,
  Plus,
  Search,
  UserCircle2,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  AppointmentRequest,
  AppointmentRequestSource,
  AppointmentRequestStatus,
  PatientMatch,
  createAppointmentRequest,
  listAppointmentRequests,
  searchPatientsByPhone,
  scheduleAppointmentFromRequest,
  updateAppointmentRequest,
} from '../services/appointmentRequests'
import { useAuth } from '../services/auth'

const sourceLabels: Record<AppointmentRequestSource, string> = {
  phone: 'Phone',
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  website: 'Website',
  walk_in: 'Walk-in',
  other: 'Other',
}

const statusLabels: Record<AppointmentRequestStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  booked: 'Booked',
  cancelled: 'Cancelled',
  completed: 'Completed',
  no_show: 'No-show',
}

const filters: Array<{ label: string; value: AppointmentRequestStatus | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'New', value: 'new' },
  { label: 'Contacted', value: 'contacted' },
  { label: 'Booked', value: 'booked' },
]

function toLocalDateTimeValue(value?: string | null) {
  const date = value ? new Date(value) : new Date(Date.now() + 60 * 60 * 1000)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function formatDate(value?: string | null) {
  if (!value) return 'Time not set'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Time not set' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function statusClass(status: AppointmentRequestStatus) {
  if (status === 'new') return 'bg-sky-50 text-sky-700'
  if (status === 'contacted') return 'bg-amber-50 text-amber-800'
  if (status === 'booked') return 'bg-emerald-50 text-emerald-700'
  return 'bg-slate-100 text-slate-600'
}

export default function AppointmentInboxPage() {
  const { user } = useAuth()
  const [requests, setRequests] = useState<AppointmentRequest[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<AppointmentRequestStatus | 'all'>('new')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [patientMatches, setPatientMatches] = useState<PatientMatch[]>([])
  const [linkedPatientId, setLinkedPatientId] = useState('')
  const [lookupPhone, setLookupPhone] = useState('')
  const [scheduleAt, setScheduleAt] = useState('')
  const [form, setForm] = useState({
    patientName: '',
    patientPhone: '',
    source: 'phone' as AppointmentRequestSource,
    requestedAt: '',
    specialty: 'General practice',
    reason: '',
    promotionCode: '',
  })

  const reload = async (preserveSelection = true) => {
    if (!user) return
    const records = await listAppointmentRequests(user)
    setRequests(records)
    setSelectedId((current) => preserveSelection && records.some((request) => request.id === current)
      ? current
      : records[0]?.id || null)
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    if (!user) return
    listAppointmentRequests(user)
      .then((records) => {
        if (!active) return
        setRequests(records)
        setSelectedId(records[0]?.id || null)
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load appointment requests.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [user])

  useEffect(() => {
    let active = true
    const phone = showForm ? form.patientPhone : lookupPhone
    setPatientMatches([])
    setLinkedPatientId('')
    if (!user || phone.replace(/\D/g, '').length < 7) return
    const timer = window.setTimeout(() => {
      searchPatientsByPhone(user, phone)
        .then((matches) => { if (active) setPatientMatches(matches) })
        .catch((searchError) => { if (active) setError(searchError instanceof Error ? searchError.message : 'Unable to search patient records.') })
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [form.patientPhone, lookupPhone, showForm, user])

  const selectedRequest = requests.find((request) => request.id === selectedId) || null
  const visibleRequests = useMemo(() => filter === 'all' ? requests : requests.filter((request) => request.status === filter), [filter, requests])

  useEffect(() => {
    if (selectedRequest) {
      setLookupPhone(selectedRequest.patient_phone)
      setScheduleAt(toLocalDateTimeValue(selectedRequest.requested_at))
    }
  }, [selectedRequest?.id])

  const submitRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!user) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const created = await createAppointmentRequest(user, {
        ...form,
        patientId: linkedPatientId || null,
      })
      await reload(false)
      setSelectedId(created.id)
      setShowForm(false)
      setForm({
        patientName: '',
        patientPhone: '',
        source: 'phone',
        requestedAt: '',
        specialty: 'General practice',
        reason: '',
        promotionCode: '',
      })
      setNotice('Appointment request added to the clinic inbox.')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save appointment request.')
    } finally {
      setSaving(false)
    }
  }

  const updateStatus = async (request: AppointmentRequest, status: AppointmentRequestStatus) => {
    if (!user) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      await updateAppointmentRequest(user, request, { status })
      await reload()
      setNotice(`Request marked ${statusLabels[status].toLowerCase()}.`)
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update request.')
    } finally {
      setSaving(false)
    }
  }

  const linkPatient = async (match: PatientMatch) => {
    if (!user || !selectedRequest) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const updated = await updateAppointmentRequest(user, selectedRequest, { patient_id: match.id })
      await reload()
      setSelectedId(updated.id)
      setNotice(`Linked to ${match.name}. No patient records were merged.`)
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : 'Unable to link this patient.')
    } finally {
      setSaving(false)
    }
  }

  const scheduleAppointment = async (request: AppointmentRequest) => {
    if (!user) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const updated = await scheduleAppointmentFromRequest(user, request, scheduleAt)
      await reload()
      setSelectedId(updated.id)
      setNotice('Appointment booked and added to the clinic calendar.')
    } catch (scheduleError) {
      setError(scheduleError instanceof Error ? scheduleError.message : 'Unable to book appointment.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Clinic workflow</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">Appointment inbox</h1>
          <p className="mt-1 hidden text-sm text-slate-500 sm:block">Capture requests from every channel and match existing patients safely.</p>
        </div>
        <button type="button" onClick={() => { setShowForm((visible) => !visible); setNotice(null); setError(null) }} className="action-button-primary shrink-0">
          <Plus className="mr-2 h-4 w-4" /> <span className="hidden sm:inline">{showForm ? 'Close form' : 'New request'}</span><span className="sm:hidden">{showForm ? 'Close' : 'New'}</span>
        </button>
      </header>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

      {showForm && (
        <section className="soft-card p-4 sm:p-5">
          <div className="mb-4">
            <h2 className="font-semibold text-slate-900">Capture appointment request</h2>
            <p className="mt-1 text-xs text-slate-500">Enter requests received by phone, messaging, website, or at the clinic.</p>
          </div>
          <form className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" onSubmit={submitRequest}>
            <label className="block"><span className="field-label">Patient name</span><input required maxLength={120} className="field-input" value={form.patientName} onChange={(event) => setForm({ ...form, patientName: event.target.value })} autoComplete="name" /></label>
            <label className="block"><span className="field-label">Phone number</span><input required maxLength={40} type="tel" inputMode="tel" className="field-input" value={form.patientPhone} onChange={(event) => { setForm({ ...form, patientPhone: event.target.value }); setLinkedPatientId('') }} autoComplete="tel" /></label>
            <label className="block"><span className="field-label">Request channel</span><select className="field-input" value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value as AppointmentRequestSource })}>{Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="block"><span className="field-label">Preferred date and time</span><input type="datetime-local" className="field-input" value={form.requestedAt} onChange={(event) => setForm({ ...form, requestedAt: event.target.value })} /></label>
            <label className="block"><span className="field-label">Doctor / specialty</span><input required maxLength={120} className="field-input" value={form.specialty} onChange={(event) => setForm({ ...form, specialty: event.target.value })} /></label>
            <label className="block"><span className="field-label">Offer / referral code (optional)</span><input maxLength={80} className="field-input" value={form.promotionCode} onChange={(event) => setForm({ ...form, promotionCode: event.target.value })} /><span className="mt-1 block text-xs text-slate-500">Recorded for follow-up; no discount is applied or validated.</span></label>
            <label className="block sm:col-span-2 xl:col-span-3"><span className="field-label">Short request note</span><textarea maxLength={1000} rows={2} className="field-textarea min-h-20" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Avoid adding detailed medical or emergency information here." /></label>

            {form.patientPhone.replace(/\D/g, '').length >= 7 && (
              <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-3 sm:col-span-2 xl:col-span-3">
                <p className="text-sm font-semibold text-slate-800">Possible existing patients</p>
                {patientMatches.length ? <div className="mt-2 grid gap-2 md:grid-cols-2">{patientMatches.map((match) => (
                  <button key={match.id} type="button" onClick={() => { setLinkedPatientId(match.id); setForm({ ...form, patientName: match.name, patientPhone: match.phone || form.patientPhone }) }} className={`rounded-lg border bg-white p-3 text-left ${linkedPatientId === match.id ? 'border-sky-500 ring-2 ring-sky-100' : 'border-slate-200 hover:border-sky-300'}`}>
                    <span className="flex items-start justify-between gap-2"><span className="font-medium text-slate-900">{match.name}</span>{linkedPatientId === match.id && <Check className="h-4 w-4 text-sky-700" />}</span>
                    <span className="mt-1 block text-xs text-slate-600">{match.phone || 'No phone on file'} · {match.visit_count} visits · {match.prescription_count} prescriptions</span>
                  </button>
                ))}</div> : <p className="mt-1 text-sm text-slate-600">No phone match found. This request will remain unlinked; no new patient record is created.</p>}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2 xl:col-span-3">
              <button disabled={saving} type="submit" className="action-button-primary disabled:opacity-60">{saving ? 'Saving…' : 'Add to inbox'}</button>
              {linkedPatientId && <span className="text-sm text-emerald-700">Existing record selected; records will not be merged.</span>}
            </div>
          </form>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(17rem,0.85fr)_minmax(0,1.15fr)]">
        <section className="soft-card overflow-hidden">
          <div className="border-b border-slate-200 p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Requests</h2>
              <span className="text-xs text-slate-500">{visibleRequests.length} shown</span>
            </div>
            <div className="mt-3 flex gap-1 overflow-x-auto pb-1" role="group" aria-label="Filter appointment requests">
              {filters.map((item) => <button key={item.value} type="button" onClick={() => setFilter(item.value)} className={`min-h-9 shrink-0 rounded-lg px-3 text-sm ${filter === item.value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{item.label}</button>)}
            </div>
          </div>
          <div className="max-h-[50vh] overflow-y-auto lg:max-h-[calc(100dvh-18rem)]">
            {loading ? <p className="p-5 text-sm text-slate-500">Loading requests…</p> : visibleRequests.length ? visibleRequests.map((request) => (
              <button key={request.id} type="button" onClick={() => { setSelectedId(request.id); setShowForm(false) }} className={`w-full border-b border-slate-100 p-4 text-left transition hover:bg-slate-50 ${selectedId === request.id ? 'bg-sky-50' : 'bg-white'}`}>
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0"><span className="block truncate font-semibold text-slate-900">{request.patient_name}</span><span className="mt-1 block text-sm text-slate-600">{request.patient_phone}</span></span>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(request.status)}`}>{statusLabels[request.status]}</span>
                </span>
                <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500"><span>{sourceLabels[request.source]}</span><span>{formatDate(request.requested_at)}</span></span>
              </button>
            )) : <div className="p-6 text-center"><Users className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 text-sm font-medium text-slate-700">No requests here</p><p className="mt-1 text-xs text-slate-500">Capture a request from any channel to get started.</p></div>}
          </div>
        </section>

        <section className="soft-card min-h-64 p-4 sm:p-5">
          {selectedRequest ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="min-w-0">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{sourceLabels[selectedRequest.source]} request</span>
                  <h2 className="mt-1 break-words text-xl font-bold text-slate-900 sm:text-2xl">{selectedRequest.patient_name}</h2>
                  <a href={`tel:${selectedRequest.patient_phone}`} className="mt-1 inline-block text-sm text-sky-700 hover:underline">{selectedRequest.patient_phone}</a>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(selectedRequest.status)}`}>{statusLabels[selectedRequest.status]}</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-500">Preferred time</span><p className="mt-1 flex items-center gap-2 text-sm font-medium text-slate-800"><CalendarDays className="h-4 w-4 text-slate-500" />{formatDate(selectedRequest.requested_at)}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-500">Doctor / specialty</span><p className="mt-1 text-sm font-medium text-slate-800">{selectedRequest.specialty}</p></div>
              </div>
              {selectedRequest.reason && <div><p className="field-label">Request note</p><p className="whitespace-pre-wrap break-words text-sm text-slate-700">{selectedRequest.reason}</p></div>}
              {selectedRequest.promotion_code && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Offer/referral code recorded: <strong>{selectedRequest.promotion_code}</strong>. It has not been validated or applied.</p>}

              <div className="rounded-xl border border-slate-200 p-3 sm:p-4">
                <div className="flex items-center gap-2"><UserCircle2 className="h-4 w-4 text-slate-500" /><h3 className="font-semibold text-slate-900">Patient record</h3></div>
                {selectedRequest.patient_id ? (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-emerald-800">Linked to a confirmed patient record.</p>
                    <Link to="/patients" className="text-sm font-medium text-sky-700 hover:underline">Open patient directory</Link>
                  </div>
                ) : (
                  <>
                    <p className="mt-1 text-sm text-slate-600">No record linked. Search by phone; choose a match only after confirming identity.</p>
                    <label className="relative mt-3 block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input aria-label="Search patients by phone" type="tel" inputMode="tel" className="field-input pl-9" value={lookupPhone} onChange={(event) => setLookupPhone(event.target.value)} /></label>
                    {lookupPhone.replace(/\D/g, '').length >= 7 && <div className="mt-2 space-y-2">{patientMatches.length ? patientMatches.map((match) => (
                      <div key={match.id} className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0"><p className="truncate font-medium text-slate-800">{match.name}</p><p className="text-xs text-slate-500">{match.phone || 'No phone'} · {match.visit_count} visits · {match.prescription_count} prescriptions{match.last_visit_at ? ` · Last visit ${new Date(match.last_visit_at).toLocaleDateString()}` : ''}</p></div>
                        <button disabled={saving} type="button" onClick={() => linkPatient(match)} className="action-button-secondary min-h-10 shrink-0"><Link2 className="mr-2 h-4 w-4" />Confirm & link</button>
                      </div>
                    )) : <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">No matching patient found. This does not create a patient record.</p>}</div>}
                  </>
                )}
              </div>

              {selectedRequest.status !== 'booked' && selectedRequest.status !== 'cancelled' && selectedRequest.status !== 'completed' && (
                <div className="space-y-3 rounded-xl bg-sky-50/70 p-3 sm:p-4">
                  <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-sky-700" /><h3 className="font-semibold text-slate-900">Book appointment</h3></div>
                  <label className="block"><span className="field-label">Confirmed date and time</span><input type="datetime-local" className="field-input bg-white" value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} /></label>
                  <button disabled={saving || !selectedRequest.patient_id} type="button" onClick={() => scheduleAppointment(selectedRequest)} className="action-button-primary w-full disabled:cursor-not-allowed disabled:opacity-50"><CalendarDays className="mr-2 h-4 w-4" />Book and add to calendar</button>
                  {!selectedRequest.patient_id && <p className="text-xs text-slate-600">Link a confirmed patient record before booking.</p>}
                </div>
              )}

              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                {selectedRequest.status === 'new' && <button disabled={saving} type="button" onClick={() => updateStatus(selectedRequest, 'contacted')} className="action-button-secondary min-h-10">Mark contacted</button>}
                {selectedRequest.status === 'contacted' && <button disabled={saving} type="button" onClick={() => updateStatus(selectedRequest, 'new')} className="action-button-secondary min-h-10">Reopen</button>}
                {(selectedRequest.status === 'new' || selectedRequest.status === 'contacted') && <button disabled={saving} type="button" onClick={() => updateStatus(selectedRequest, 'cancelled')} className="action-button-secondary min-h-10 !text-rose-700">Cancel request</button>}
                {selectedRequest.status === 'booked' && selectedRequest.appointment_id && <p className="flex items-center gap-2 text-sm text-emerald-800"><Check className="h-4 w-4" />Appointment is on the clinic calendar.</p>}
              </div>
            </div>
          ) : <div className="flex min-h-56 flex-col items-center justify-center text-center"><Users className="h-9 w-9 text-slate-300" /><p className="mt-3 font-medium text-slate-700">Select a request</p><p className="mt-1 text-sm text-slate-500">Patient matching and booking details will appear here.</p></div>}
        </section>
      </div>
      <p className="text-xs leading-relaxed text-slate-500">Only capture what is needed to arrange the appointment. Offer codes are recorded for follow-up and are not validated or applied. Website channel can be recorded by staff; public self-booking is not enabled.</p>
    </div>
  )
}
