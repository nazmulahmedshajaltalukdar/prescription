import React, { useEffect, useState } from 'react'
import { ArrowRight, CalendarCheck2, FileText, ListOrdered, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../services/auth'
import { db } from '../services/db'
import { localDateKey } from '../services/clinicWorkflow'
import { filterTenantRecords } from '../services/tenant'

const quickActions = [
  { title: 'Register patient', description: 'Create a patient profile in the clinic CRM.', to: '/patients/new', accent: 'sky' },
  { title: 'Book appointment', description: 'Schedule a patient in the internal calendar.', to: '/calendar', accent: 'violet' },
  { title: 'Issue serial', description: 'Open today’s check-in and waiting queue.', to: '/queue', accent: 'emerald' },
]

export default function DashboardPage() {
  const { user } = useAuth()
  const [stats, setStats] = useState([
    { label: 'Patients', value: '0', icon: Users, tone: 'bg-sky-100 text-sky-700' },
    { label: "Today's appointments", value: '0', icon: CalendarCheck2, tone: 'bg-emerald-100 text-emerald-700' },
    { label: 'Prescriptions', value: '0', icon: FileText, tone: 'bg-violet-100 text-violet-700' },
    { label: 'Active serials', value: '0', icon: ListOrdered, tone: 'bg-amber-100 text-amber-700' },
  ])
  const [queue, setQueue] = useState<Array<{ id?: number; display_code: string; patient_name: string; status: string }>>([])

  useEffect(() => {
    let active = true
    Promise.all([db.patients.toArray(), db.appointments.toArray(), db.prescriptions.toArray(), db.serialTickets.toArray()]).then(([patients, appointments, prescriptions, serialTickets]) => {
      if (!active) return
      const scopedPatients = user ? filterTenantRecords(patients, user.scope) : patients
      const scopedAppointments = user ? filterTenantRecords(appointments, user.scope) : appointments
      const scopedPrescriptions = user ? filterTenantRecords(prescriptions, user.scope) : prescriptions
      const scopedTickets = user ? filterTenantRecords(serialTickets, user.scope) : serialTickets
      const today = localDateKey()
      const todaysAppointments = scopedAppointments.filter((appointment) => localDateKey(new Date(appointment.start_at)) === today && appointment.status !== 'cancelled')
      const todaysTickets = scopedTickets.filter((ticket) => ticket.date_key === today).sort((left, right) => left.serial_number - right.serial_number)
      const activeTickets = todaysTickets.filter((ticket) => ticket.status === 'waiting' || ticket.status === 'in_consult')
      setStats([
        { label: 'Patients', value: String(scopedPatients.length), icon: Users, tone: 'bg-sky-100 text-sky-700' },
        { label: "Today's appointments", value: String(todaysAppointments.length), icon: CalendarCheck2, tone: 'bg-emerald-100 text-emerald-700' },
        { label: 'Prescriptions', value: String(scopedPrescriptions.length), icon: FileText, tone: 'bg-violet-100 text-violet-700' },
        { label: 'Active serials', value: String(activeTickets.length), icon: ListOrdered, tone: 'bg-amber-100 text-amber-700' },
      ])
      setQueue(todaysTickets.slice(0, 5))
    })
    return () => { active = false }
  }, [user])

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-1">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Clinic overview</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="soft-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">{label}</p>
                <p className="mt-3 text-3xl font-bold text-slate-900">{value}</p>
              </div>
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="soft-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Quick actions</h2>
              <span className="text-xs text-slate-500">Open a workflow</span>
          </div>

          <div className="space-y-3">
            {quickActions.map(({ title, description, to, accent }) => (
              <Link
                key={title}
                to={to}
                className={`flex items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4 transition hover:border-slate-300 hover:bg-slate-50 ${
                  accent === 'sky' ? 'bg-sky-50/70' : accent === 'violet' ? 'bg-violet-50/70' : 'bg-emerald-50/70'
                }`}
              >
                <div>
                  <p className="text-base font-semibold text-slate-900">{title}</p>
                  <p className="mt-1 text-sm text-slate-600">{description}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-600" />
              </Link>
            ))}
          </div>
        </div>

        <div className="soft-card p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Today’s serial queue</h2>
            <Link to="/queue" className="text-sm font-medium text-sky-700">Open queue</Link>
          </div>
          <div className="mt-4 space-y-3">
            {queue.length ? queue.map((ticket) => <div key={ticket.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-3"><span className="rounded-md bg-slate-900 px-2 py-1 text-xs font-bold text-white">{ticket.display_code}</span><span className="font-medium text-slate-800">{ticket.patient_name}</span></div>
              <span className="text-xs capitalize text-slate-500">{ticket.status.replace('_', ' ')}</span>
            </div>) : <p className="rounded-lg border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">No serials have been issued today.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}