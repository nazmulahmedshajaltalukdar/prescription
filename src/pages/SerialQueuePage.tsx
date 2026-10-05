import React, { FormEvent, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, ListOrdered } from 'lucide-react'
import IntegrationStatus from '../components/IntegrationStatus'
import { useAuth } from '../services/auth'
import { db } from '../services/db'
import { issueSerialTicket, localDateKey } from '../services/clinicWorkflow'
import { filterTenantRecords } from '../services/tenant'
import { Appointment, Patient, SerialTicket } from '../types'

const nextStatus: Record<SerialTicket['status'], SerialTicket['status'] | null> = {
  waiting: 'in_consult',
  in_consult: 'completed',
  completed: null,
  cancelled: null,
}

export default function SerialQueuePage() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const ticketId = (location.state as { ticketId?: number } | null)?.ticketId
  const [patients, setPatients] = useState<Patient[]>([])
  const [tickets, setTickets] = useState<SerialTicket[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [patientId, setPatientId] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const dateKey = localDateKey()

  const reload = async () => {
    const [allPatients, allTickets, allAppointments] = await Promise.all([db.patients.toArray(), db.serialTickets.toArray(), db.appointments.toArray()])
    const scopedPatients = user ? filterTenantRecords(allPatients, user.scope) : allPatients
    const scopedTickets = user ? filterTenantRecords(allTickets, user.scope) : allTickets
    const scopedAppointments = user ? filterTenantRecords(allAppointments, user.scope) : allAppointments
    setPatients(scopedPatients)
    setTickets(scopedTickets.filter((ticket) => ticket.date_key === dateKey).sort((left, right) => left.serial_number - right.serial_number))
    setAppointments(scopedAppointments)
  }

  useEffect(() => { reload() }, [user, dateKey])

  const issueForPatient = async (event: FormEvent) => {
    event.preventDefault()
    if (!user) return
    const patient = patients.find((item) => String(item.id) === patientId)
    if (!patient) return
    const ticket = await issueSerialTicket({ patient, tenantId: user.tenant_id, subTenantId: user.sub_tenant_id, createdBy: user.id })
    setMessage(`Serial ${ticket.display_code} issued for ${ticket.patient_name}.`)
    setPatientId('')
    await reload()
  }

  const issueFromAppointment = async (appointment: Appointment) => {
    if (!user) return
    const patient = patients.find((item) => String(item.id) === appointment.patient_id)
    if (!patient) {
      setMessage('Patient is not available in local records.')
      return
    }
    const ticket = await issueSerialTicket({ patient, tenantId: user.tenant_id, subTenantId: user.sub_tenant_id, createdBy: user.id, appointment })
    if (appointment.id) await db.updateRecordWithSync('appointments', appointment.id, { status: 'checked_in' })
    setMessage(`Serial ${ticket.display_code} issued for ${ticket.patient_name}.`)
    await reload()
  }

  const advance = async (ticket: SerialTicket) => {
    const status = nextStatus[ticket.status]
    if (!ticket.id || !status) return
    await db.updateRecordWithSync('serialTickets', ticket.id, { status })
    if (ticket.appointment_id) {
      const appointment = appointments.find((item) => item.id === ticket.appointment_id)
      if (appointment?.id) await db.updateRecordWithSync('appointments', appointment.id, { status: status === 'in_consult' ? 'in_consult' : 'completed' })
    }
    await reload()
  }

  const cancel = async (ticket: SerialTicket) => {
    if (!ticket.id) return
    await db.updateRecordWithSync('serialTickets', ticket.id, { status: 'cancelled' })
    await reload()
  }

  const bookedAppointments = appointments.filter((appointment) => appointment.status === 'scheduled' && localDateKey(new Date(appointment.start_at)) === dateKey)
  const activeCount = tickets.filter((ticket) => ticket.status === 'waiting' || ticket.status === 'in_consult').length

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold uppercase text-slate-500">Internal serial system</p><h1 className="mt-1 text-3xl font-bold text-slate-900">Today’s queue</h1><p className="mt-1 text-sm text-slate-600">{new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p></div>
        <IntegrationStatus />
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="soft-card p-4"><p className="text-sm text-slate-500">Issued today</p><p className="mt-2 text-3xl font-bold">{tickets.length}</p></div>
        <div className="soft-card p-4"><p className="text-sm text-slate-500">Waiting / in consultation</p><p className="mt-2 text-3xl font-bold">{activeCount}</p></div>
        <div className="soft-card p-4"><p className="text-sm text-slate-500">Appointments to check in</p><p className="mt-2 text-3xl font-bold">{bookedAppointments.length}</p></div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-5">
          <section className="soft-card p-5">
            <h2 className="font-semibold text-slate-900">Issue walk-in serial</h2>
            <form onSubmit={issueForPatient} className="mt-4 flex flex-col gap-3">
              <label><span className="field-label">Patient</span><select required className="field-input" value={patientId} onChange={(event) => setPatientId(event.target.value)}><option value="">Select patient</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name} · {patient.phone || patient.id}</option>)}</select></label>
              <button className="action-button-primary" type="submit" disabled={!patients.length}><ListOrdered className="mr-2 h-4 w-4" /> Issue next serial</button>
            </form>
            {!patients.length && <p className="mt-3 text-sm text-slate-500">Add patients from the CRM before issuing a serial.</p>}
          </section>

          <section className="soft-card p-5">
            <h2 className="font-semibold text-slate-900">Scheduled arrivals</h2>
            <div className="mt-3 space-y-2">{bookedAppointments.length ? bookedAppointments.map((appointment) => <div key={appointment.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-3"><div><p className="text-sm font-medium">{appointment.patient_name}</p><p className="text-xs text-slate-500">{new Date(appointment.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {appointment.specialty}</p></div><button type="button" className="action-button-secondary !px-3 !py-2" onClick={() => issueFromAppointment(appointment)} title="Check in and issue serial"><ArrowRight className="h-4 w-4" /></button></div>) : <p className="text-sm text-slate-500">No scheduled arrivals remain.</p>}</div>
          </section>
        </div>

        <section className="soft-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 p-5"><div><h2 className="font-semibold text-slate-900">Queue</h2><p className="mt-1 text-sm text-slate-500">Serial numbers reset by clinic each local day.</p></div>{ticketId && <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">Latest: {tickets.find((ticket) => ticket.id === ticketId)?.display_code || 'Added'}</span>}</div>
          {message && <p className="mx-5 mt-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-800">{message}</p>}
          <div className="divide-y divide-slate-100">{tickets.length ? tickets.map((ticket) => <article key={ticket.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="flex h-12 w-16 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">{ticket.display_code}</div><div><p className="font-medium text-slate-900">{ticket.patient_name}</p><p className="mt-1 text-xs capitalize text-slate-500">{ticket.status.replace('_', ' ')} · issued {new Date(ticket.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p></div></div><div className="flex items-center gap-2">{nextStatus[ticket.status] && <button type="button" className="action-button-secondary !px-3 !py-2" onClick={() => advance(ticket)}>{ticket.status === 'waiting' ? 'Start consultation' : 'Complete'}</button>}{ticket.status === 'waiting' && <button type="button" className="action-button-danger !px-3 !py-2" onClick={() => cancel(ticket)}>Cancel</button>}</div></article>) : <p className="p-8 text-center text-sm text-slate-500">No serials issued today.</p>}</div>
        </section>
      </div>
    </div>
  )
}