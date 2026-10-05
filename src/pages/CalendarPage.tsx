import React, { FormEvent, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react'
import IntegrationStatus from '../components/IntegrationStatus'
import { useAuth } from '../services/auth'
import { db } from '../services/db'
import { getWeekDates, issueSerialTicket, localDateKey } from '../services/clinicWorkflow'
import { filterTenantRecords } from '../services/tenant'
import { Appointment, Patient } from '../types'

function toLocalDateTimeValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

export default function CalendarPage() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const requestedPatient = (location.state as { patientId?: string | number } | null)?.patientId
  const [patients, setPatients] = useState<Patient[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [focusDate, setFocusDate] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState(() => localDateKey())
  const [patientId, setPatientId] = useState(requestedPatient ? String(requestedPatient) : '')
  const [startAt, setStartAt] = useState(() => toLocalDateTimeValue(new Date(Date.now() + 60 * 60 * 1000)))
  const [specialty, setSpecialty] = useState('General practice')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const weekDates = useMemo(() => getWeekDates(focusDate), [focusDate])

  const reload = async () => {
    const [allPatients, allAppointments] = await Promise.all([db.patients.toArray(), db.appointments.toArray()])
    const scopedPatients = user ? filterTenantRecords(allPatients, user.scope) : allPatients
    const scopedAppointments = user ? filterTenantRecords(allAppointments, user.scope) : allAppointments
    setPatients(scopedPatients)
    setAppointments(scopedAppointments.sort((left, right) => left.start_at.localeCompare(right.start_at)))
  }

  useEffect(() => {
    reload()
  }, [user])

  const weekStart = localDateKey(weekDates[0])
  const weekEnd = localDateKey(weekDates[6])
  const weekAppointments = appointments.filter((appointment) => {
    const key = localDateKey(new Date(appointment.start_at))
    return key >= weekStart && key <= weekEnd
  })
  const dayAppointments = weekAppointments.filter((appointment) => localDateKey(new Date(appointment.start_at)) === selectedDay)

  const saveAppointment = async (event: FormEvent) => {
    event.preventDefault()
    const patient = patients.find((item) => String(item.id) === patientId)
    const start = new Date(startAt)
    if (!patient || Number.isNaN(start.getTime())) {
      setMessage('Select a patient and valid appointment time.')
      return
    }

    const appointment: Appointment = {
      tenant_id: user?.tenant_id,
      sub_tenant_id: user?.sub_tenant_id,
      patient_id: String(patient.id),
      patient_name: patient.name,
      start_at: start.toISOString(),
      duration_minutes: 20,
      specialty,
      reason: reason.trim() || undefined,
      status: 'scheduled',
      created_by: user?.id,
      created_at: new Date().toISOString(),
    }
    await db.createRecordsWithSync([{ table: 'appointments', item: appointment }])
    setSelectedDay(localDateKey(start))
    setFocusDate(start)
    setReason('')
    setMessage('Appointment added to the internal calendar.')
    await reload()
  }

  const checkIn = async (appointment: Appointment) => {
    if (!user || !appointment.id) return
    const patient = patients.find((item) => String(item.id) === String(appointment.patient_id))
    if (!patient) {
      setMessage('Patient record is unavailable in this browser. Find the patient in CRM before check-in.')
      return
    }
    const ticket = await issueSerialTicket({ patient, tenantId: user.tenant_id, subTenantId: user.sub_tenant_id, createdBy: user.id, appointment })
    await db.updateRecordWithSync('appointments', appointment.id, { status: 'checked_in' })
    navigate('/queue', { state: { ticketId: ticket.id } })
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">Internal scheduling</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Calendar</h1>
        </div>
        <IntegrationStatus />
      </header>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        <section className="soft-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-emerald-700" />
              <h2 className="font-semibold text-slate-900">Week agenda</h2>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="action-button-secondary !px-2.5" title="Previous week" onClick={() => setFocusDate((date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - 7))}><ChevronLeft className="h-4 w-4" /></button>
              <input aria-label="Choose calendar date" type="date" className="field-input !w-auto" value={localDateKey(focusDate)} onChange={(event) => {
                const next = new Date(`${event.target.value}T12:00:00`)
                if (!Number.isNaN(next.getTime())) { setFocusDate(next); setSelectedDay(event.target.value) }
              }} />
              <button type="button" className="action-button-secondary !px-2.5" title="Next week" onClick={() => setFocusDate((date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7))}><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {weekDates.map((date) => {
              const key = localDateKey(date)
              const count = weekAppointments.filter((appointment) => localDateKey(new Date(appointment.start_at)) === key).length
              return <button key={key} type="button" onClick={() => setSelectedDay(key)} className={`min-h-20 rounded-lg border p-3 text-left ${selectedDay === key ? 'border-emerald-700 bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                <span className="block text-xs text-slate-500">{date.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                <span className="mt-1 block text-lg font-semibold text-slate-900">{date.getDate()}</span>
                <span className="mt-1 block text-xs text-slate-500">{count} booked</span>
              </button>
            })}
          </div>

          <div className="mt-6 border-t border-slate-200 pt-4">
            <h3 className="font-semibold text-slate-900">{new Date(`${selectedDay}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
            {dayAppointments.length ? <div className="mt-3 space-y-2">{dayAppointments.map((appointment) => <article key={appointment.id} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{new Date(appointment.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <div><p className="font-medium text-slate-900">{appointment.patient_name}</p><p className="mt-0.5 text-sm text-slate-500">{appointment.specialty}{appointment.reason ? ` · ${appointment.reason}` : ''}</p></div>
              </div>
              {appointment.status === 'scheduled' ? <button type="button" className="action-button-secondary" onClick={() => checkIn(appointment)}>Check in / issue serial</button> : <span className="text-xs font-medium capitalize text-slate-500">{appointment.status.replace('_', ' ')}</span>}
            </article>)}</div> : <p className="mt-3 text-sm text-slate-500">No appointments for this day.</p>}
          </div>
        </section>

        <section className="soft-card p-5">
          <h2 className="font-semibold text-slate-900">Book appointment</h2>
          <form className="mt-4 space-y-4" onSubmit={saveAppointment}>
            <label className="block"><span className="field-label">Patient</span><select required className="field-input" value={patientId} onChange={(event) => setPatientId(event.target.value)}><option value="">Select patient</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name} · {patient.phone || patient.id}</option>)}</select></label>
            <label className="block"><span className="field-label">Date and time</span><input required type="datetime-local" className="field-input" value={startAt} onChange={(event) => setStartAt(event.target.value)} /></label>
            <label className="block"><span className="field-label">Specialty</span><input required className="field-input" value={specialty} onChange={(event) => setSpecialty(event.target.value)} /></label>
            <label className="block"><span className="field-label">Reason for visit</span><textarea className="field-textarea" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
            <button className="action-button-primary w-full" type="submit"><Clock3 className="mr-2 h-4 w-4" /> Add to calendar</button>
          </form>
          {!patients.length && <p className="mt-4 text-sm text-amber-800">Register a patient before booking: <a className="underline" href="/patients/new">patient registration</a>.</p>}
          {message && <p className="mt-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-800">{message}</p>}
          <p className="mt-4 text-xs text-slate-500">Appointments are stored on this device. External calendar sync will be enabled when a provider is selected.</p>
        </section>
      </div>
    </div>
  )
}