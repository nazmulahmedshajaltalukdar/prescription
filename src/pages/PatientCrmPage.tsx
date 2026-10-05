import React, { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Search, UserPlus } from 'lucide-react'
import { Link } from 'react-router-dom'
import IntegrationStatus from '../components/IntegrationStatus'
import { db } from '../services/db'
import { useAuth } from '../services/auth'
import { filterTenantRecords } from '../services/tenant'
import { Patient, Prescription, Visit } from '../types'

export default function PatientCrmPage() {
  const { user } = useAuth()
  const [patients, setPatients] = useState<Patient[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([db.patients.toArray(), db.visits.toArray(), db.prescriptions.toArray()]).then(([allPatients, allVisits, allPrescriptions]) => {
      if (!active) return
      const scopedPatients = user ? filterTenantRecords(allPatients, user.scope) : allPatients
      const scopedVisits = user ? filterTenantRecords(allVisits, user.scope) : allVisits
      const scopedPrescriptions = user ? filterTenantRecords(allPrescriptions, user.scope) : allPrescriptions
      setPatients(scopedPatients)
      setVisits(scopedVisits)
      setPrescriptions(scopedPrescriptions)
      if (scopedPatients.length) setSelectedId(String(scopedPatients[0].id))
    })
    return () => { active = false }
  }, [user])

  const filteredPatients = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return patients
    return patients.filter((patient) => [
      patient.name,
      patient.phone,
      patient.id,
      patient.hospital_id,
      patient.date_of_birth,
      patient.gender,
      patient.address,
    ].filter(Boolean).join(' ').toLowerCase().includes(normalized))
  }, [patients, query])

  const selectedPatient = patients.find((patient) => String(patient.id) === selectedId)
  const patientVisits = selectedPatient ? visits.filter((visit) => String(visit.patient_id) === String(selectedPatient.id)) : []
  const patientPrescriptions = selectedPatient
    ? prescriptions.filter((prescription) => patientVisits.some((visit) => String(visit.id) === String(prescription.visit_id)))
    : []

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">Internal CRM</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Patient directory</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <IntegrationStatus />
          <Link to="/patients/new" className="action-button-primary"><UserPlus className="mr-2 h-4 w-4" /> Register patient</Link>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="soft-card overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Patients</h2>
              <p className="mt-1 text-sm text-slate-500">{filteredPatients.length} matching records</p>
            </div>
            <label className="relative block sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className="field-input pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search all patient details" />
            </label>
          </div>
          <div className="max-h-[600px] overflow-auto">
            {filteredPatients.length ? filteredPatients.map((patient) => (
              <button key={patient.id} type="button" onClick={() => setSelectedId(String(patient.id))} className={`w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${String(patient.id) === selectedId ? 'bg-sky-50' : 'bg-white'}`}>
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0 truncate font-medium text-slate-900">{patient.name}</span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400" />
                </span>
                <span className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-3">
                  <span><span className="text-slate-500">Patient ID: </span><span className="text-slate-700">{patient.hospital_id || patient.id || '—'}</span></span>
                  <span><span className="text-slate-500">Phone: </span><span className="text-slate-700">{patient.phone || '—'}</span></span>
                  <span><span className="text-slate-500">DOB: </span><span className="text-slate-700">{patient.date_of_birth || '—'}</span></span>
                  <span><span className="text-slate-500">Gender: </span><span className="text-slate-700">{patient.gender || '—'}</span></span>
                  <span className="col-span-2 sm:col-span-3"><span className="text-slate-500">Address: </span><span className="break-words text-slate-700">{patient.address || '—'}</span></span>
                  <span className="col-span-2 sm:col-span-3"><span className="text-slate-500">Added: </span><span className="text-slate-700">{patient.created_at ? new Date(patient.created_at).toLocaleString() : '—'}</span></span>
                </span>
              </button>
            )) : <p className="p-6 text-sm text-slate-500">No patient records stored in this browser yet.</p>}
          </div>
        </section>

        <section className="soft-card p-5">
          {selectedPatient ? <>
            <div className="border-b border-slate-200 pb-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Patient profile</p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900">{selectedPatient.name}</h2>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-slate-500">Patient ID</dt><dd className="text-slate-700">{selectedPatient.hospital_id || selectedPatient.id}</dd>
                <dt className="text-slate-500">Phone</dt><dd className="text-slate-700">{selectedPatient.phone || 'Not recorded'}</dd>
                <dt className="text-slate-500">Date of birth</dt><dd className="text-slate-700">{selectedPatient.date_of_birth || 'Not recorded'}</dd>
                <dt className="text-slate-500">Gender</dt><dd className="text-slate-700">{selectedPatient.gender || 'Not recorded'}</dd>
                <dt className="text-slate-500">Address</dt><dd className="break-words text-slate-700">{selectedPatient.address || 'Not recorded'}</dd>
                <dt className="text-slate-500">Added</dt><dd className="text-slate-700">{selectedPatient.created_at ? new Date(selectedPatient.created_at).toLocaleString() : 'Not recorded'}</dd>
              </dl>
              <div className="mt-4 flex gap-2">
                <Link to="/calendar" state={{ patientId: selectedPatient.id }} className="action-button-secondary">Book appointment</Link>
                <Link to="/prescription" state={{ patientId: selectedPatient.id }} className="action-button-secondary">New prescription</Link>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 py-4">
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Visits</p><p className="mt-1 text-xl font-semibold">{patientVisits.length}</p></div>
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Prescriptions</p><p className="mt-1 text-xl font-semibold">{patientPrescriptions.length}</p></div>
            </div>
            <h3 className="text-sm font-semibold text-slate-800">Recent visits</h3>
            {patientVisits.length ? <ul className="mt-2 divide-y divide-slate-100">{patientVisits.slice().reverse().slice(0, 5).map((visit) => <li key={visit.id} className="flex justify-between py-2 text-sm"><span>{visit.specialty || visit.visit_type || 'Visit'}</span><span className="text-slate-500">{visit.created_at ? new Date(visit.created_at).toLocaleDateString() : '—'}</span></li>)}</ul> : <p className="mt-2 text-sm text-slate-500">No visit history in this browser.</p>}
          </> : <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">Select a patient to view the profile.</div>}
        </section>
      </div>
    </div>
  )
}