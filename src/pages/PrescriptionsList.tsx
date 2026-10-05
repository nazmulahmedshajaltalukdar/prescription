import React, { useEffect, useMemo, useState } from 'react'
import { LayoutGrid, List, Search, X } from 'lucide-react'
import { db } from '../services/db'
import { Patient, Prescription, Visit } from '../types'
import { useAuth } from '../services/auth'
import { filterTenantRecords } from '../services/tenant'

type ViewMode = 'list' | 'grid'

export default function PrescriptionsList() {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const { user } = useAuth()

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const [allPrescriptions, allVisits, allPatients] = await Promise.all([
          db.prescriptions.orderBy('created_at').reverse().toArray(),
          db.visits.toArray(),
          db.patients.toArray(),
        ])
        if (!mounted) return

        setPrescriptions(user ? filterTenantRecords(allPrescriptions, user.scope) : allPrescriptions)
        setVisits(user ? filterTenantRecords(allVisits, user.scope) : allVisits)
        setPatients(user ? filterTenantRecords(allPatients, user.scope) : allPatients)
      } catch (error) {
        console.error('Unable to load prescription records', error)
        if (mounted) setLoadError('Unable to load prescription records. Please try again.')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    void load()
    return () => {
      mounted = false
    }
  }, [user])

  const visitById = useMemo(() => new Map(visits.map((visit) => [String(visit.id), visit])), [visits])
  const patientById = useMemo(() => new Map(patients.map((patient) => [String(patient.id), patient])), [patients])
  const searchRecords = useMemo(() => prescriptions.map((prescription) => {
    const visit = visitById.get(String(prescription.visit_id))
    const patient = visit ? patientById.get(String(visit.patient_id)) : undefined
    const searchable = [
      prescription.id,
      prescription.visit_id,
      prescription.doctor_id,
      prescription.notes,
      prescription.created_at,
      patient?.name,
      patient?.hospital_id,
      patient?.phone,
      ...Object.values(prescription.print_details || {}),
      ...prescription.items.flatMap((item) => [
        item.brand,
        item.generic,
        item.dose,
        item.frequency,
        item.duration,
        item.instructions,
      ]),
    ].filter(Boolean).join(' ').toLowerCase()
    return { prescription, visit, patient, searchable }
  }), [prescriptions, visitById, patientById])
  const normalizedQuery = query.trim().toLowerCase()
  const filteredRecords = searchRecords.filter((record) => !normalizedQuery || record.searchable.includes(normalizedQuery))

  useEffect(() => {
    if (!normalizedQuery) return
    if (filteredRecords.length === 1) {
      setSelectedId(String(filteredRecords[0].prescription.id))
    } else if (selectedId && !filteredRecords.some((record) => String(record.prescription.id) === selectedId)) {
      setSelectedId(null)
    }
  }, [normalizedQuery, filteredRecords, selectedId])

  const selectedRecord = searchRecords.find((record) => String(record.prescription.id) === selectedId)

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Clinical history</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Saved Prescriptions</h1>
          <p className="mt-1 text-sm text-slate-600">Search or select a prescription to view its full details.</p>
        </div>
        <label className="relative block sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            className="field-input pl-9 pr-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search patient, prescription, medicine..."
            aria-label="Search prescriptions"
          />
          {query && (
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700" onClick={() => setQuery('')} aria-label="Clear search">
              <X className="h-4 w-4" />
            </button>
          )}
        </label>
      </header>

      {loading && <div className="soft-card p-5 text-sm text-slate-600">Loading prescription records...</div>}
      {loadError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{loadError}</div>}

      {!loading && !loadError && (
        <>
          <section className="soft-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
              <p className="text-sm text-slate-600">{filteredRecords.length} {filteredRecords.length === 1 ? 'prescription' : 'prescriptions'}</p>
              <div className="flex rounded-lg border border-slate-200 p-1" role="group" aria-label="Prescription view">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  aria-pressed={viewMode === 'list'}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${viewMode === 'list' ? 'bg-sky-100 font-medium text-sky-800' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  <List className="h-4 w-4" /> List
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  aria-pressed={viewMode === 'grid'}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${viewMode === 'grid' ? 'bg-sky-100 font-medium text-sky-800' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  <LayoutGrid className="h-4 w-4" /> Grid
                </button>
              </div>
            </div>

            {filteredRecords.length ? (
              <div className={viewMode === 'grid' ? 'grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3' : 'divide-y divide-slate-100'}>
                {filteredRecords.map(({ prescription, patient }) => {
                  const isSelected = String(prescription.id) === selectedId
                  return (
                    <button
                      key={prescription.id}
                      type="button"
                      onClick={() => setSelectedId(isSelected ? null : String(prescription.id))}
                      aria-expanded={isSelected}
                      className={`text-left transition hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-500 ${viewMode === 'grid' ? 'rounded-xl border border-slate-200 p-4' : 'flex w-full flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between'} ${isSelected ? 'bg-sky-50' : 'bg-white'}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-slate-900">{patient?.name || 'Patient details unavailable'}</span>
                        <span className="mt-1 block truncate text-sm text-slate-600">
                          Prescription #{prescription.id ?? '—'} · {prescription.items?.length || 0} medicines
                        </span>
                      </span>
                      <span className={`text-sm text-slate-500 ${viewMode === 'grid' ? 'mt-3 block' : 'shrink-0'}`}>
                        {prescription.created_at ? new Date(prescription.created_at).toLocaleString() : 'Date not recorded'}
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="p-6 text-sm text-slate-600">{prescriptions.length ? 'No prescriptions match your search.' : 'No prescriptions saved yet.'}</p>
            )}
          </section>

          {selectedRecord && (
            <article className="soft-card overflow-hidden">
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Prescription details</p>
                  <h2 className="mt-1 font-semibold text-slate-900">#{selectedRecord.prescription.id ?? '—'}</h2>
                </div>
                <button type="button" onClick={() => setSelectedId(null)} className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-slate-800" aria-label="Close prescription details">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid gap-5 p-5 lg:grid-cols-[0.8fr_1.2fr]">
                <section aria-label="Patient and visit details">
                  <h3 className="text-sm font-semibold text-slate-800">Patient & visit</h3>
                  <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                    <dt className="text-slate-500">Patient</dt>
                    <dd className="font-medium text-slate-800">{selectedRecord.patient?.name || 'Patient details unavailable'}</dd>
                    <dt className="text-slate-500">Patient ID</dt>
                    <dd className="text-slate-700">{selectedRecord.patient?.hospital_id || selectedRecord.patient?.id || '—'}</dd>
                    <dt className="text-slate-500">Phone</dt>
                    <dd className="text-slate-700">{selectedRecord.patient?.phone || '—'}</dd>
                    <dt className="text-slate-500">Visit ID</dt>
                    <dd className="text-slate-700">{selectedRecord.prescription.visit_id || '—'}</dd>
                    <dt className="text-slate-500">Visit type</dt>
                    <dd className="text-slate-700">{selectedRecord.visit?.visit_type || '—'}</dd>
                    <dt className="text-slate-500">Department</dt>
                    <dd className="text-slate-700">{selectedRecord.visit?.specialty || '—'}</dd>
                    <dt className="text-slate-500">Clinician ID</dt>
                    <dd className="break-all text-slate-700">{selectedRecord.prescription.doctor_id || '—'}</dd>
                    <dt className="text-slate-500">Created</dt>
                    <dd className="text-slate-700">{selectedRecord.prescription.created_at ? new Date(selectedRecord.prescription.created_at).toLocaleString() : 'Not recorded'}</dd>
                  </dl>
                  <div className="mt-4">
                    <h4 className="text-sm font-semibold text-slate-800">Clinical notes</h4>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{selectedRecord.prescription.notes || 'No notes recorded.'}</p>
                  </div>
                  {selectedRecord.prescription.print_details && (
                    <div className="mt-4">
                      <h4 className="text-sm font-semibold text-slate-800">Prescription snapshot</h4>
                      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                        <dt className="text-slate-500">Prescription no.</dt>
                        <dd className="text-slate-700">{selectedRecord.prescription.print_details.prescription_no || '—'}</dd>
                        <dt className="text-slate-500">Patient at issue</dt>
                        <dd className="text-slate-700">{selectedRecord.prescription.print_details.patient_name || selectedRecord.patient?.name || '—'}</dd>
                        <dt className="text-slate-500">Patient ID / phone</dt>
                        <dd className="text-slate-700">{selectedRecord.prescription.print_details.patient_id_no || '—'} / {selectedRecord.prescription.print_details.patient_phone || '—'}</dd>
                        <dt className="text-slate-500">Age / sex</dt>
                        <dd className="text-slate-700">{selectedRecord.prescription.print_details.age || '—'} / {selectedRecord.prescription.print_details.gender || '—'}</dd>
                        <dt className="text-slate-500">Follow-up</dt>
                        <dd className="text-slate-700">{selectedRecord.prescription.print_details.follow_up_date || '—'}</dd>
                        <dt className="text-slate-500">Doctor</dt>
                        <dd className="text-slate-700">{selectedRecord.prescription.print_details.doctor_name || '—'}{selectedRecord.prescription.print_details.doctor_reg_no ? ` · ${selectedRecord.prescription.print_details.doctor_reg_no}` : ''}</dd>
                        <dt className="text-slate-500">Qualifications</dt>
                        <dd className="text-slate-700">{selectedRecord.prescription.print_details.doctor_qualifications || '—'}</dd>
                        <dt className="text-slate-500">Clinic</dt>
                        <dd className="text-slate-700">{selectedRecord.prescription.print_details.clinic_name || '—'}</dd>
                        <dt className="text-slate-500">Clinic registration</dt>
                        <dd className="text-slate-700">{selectedRecord.prescription.print_details.clinic_reg_no || '—'}</dd>
                        <dt className="text-slate-500">Clinic address / phone</dt>
                        <dd className="text-slate-700">{selectedRecord.prescription.print_details.clinic_address || '—'} / {selectedRecord.prescription.print_details.clinic_phone || '—'}</dd>
                        <dt className="text-slate-500">Department</dt>
                        <dd className="text-slate-700">{selectedRecord.prescription.print_details.department || '—'}</dd>
                        <dt className="text-slate-500">Prescription format</dt>
                        <dd className="text-slate-700">{selectedRecord.prescription.print_details.clinic_preset || '—'}</dd>
                        <dt className="text-slate-500">Pharmacist</dt>
                        <dd className="text-slate-700">{selectedRecord.prescription.print_details.pharmacist_name || '—'}</dd>
                        <dt className="text-slate-500">Official stamp</dt>
                        <dd className="text-slate-700">{selectedRecord.prescription.print_details.stamp_text || '—'}</dd>
                        <dt className="text-slate-500">Emergency format</dt>
                        <dd className="text-slate-700">{selectedRecord.prescription.print_details.is_emergency ? 'Yes' : 'No'}</dd>
                      </dl>
                      {selectedRecord.prescription.print_details.warnings && (
                        <div className="mt-3">
                          <h5 className="text-xs font-semibold uppercase tracking-wide text-amber-700">Warnings / contraindications</h5>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-amber-900">{selectedRecord.prescription.print_details.warnings}</p>
                        </div>
                      )}
                      {selectedRecord.prescription.print_details.signature_data_url && (
                        <img className="mt-3 max-h-16 max-w-48 object-contain" src={selectedRecord.prescription.print_details.signature_data_url} alt="Saved drawn clinician signature" />
                      )}
                    </div>
                  )}
                </section>
                <section aria-label="Prescribed medicines">
                  <h3 className="text-sm font-semibold text-slate-800">Medicines ({selectedRecord.prescription.items?.length || 0})</h3>
                  {selectedRecord.prescription.items?.length ? (
                    <div className="mt-3 space-y-3">
                      {selectedRecord.prescription.items.map((item, index) => (
                        <div key={`${item.drug_id || item.brand || item.generic || index}-${index}`} className="rounded-xl border border-slate-200 p-3">
                          <div className="font-medium text-slate-900">{item.brand || item.generic || 'Medicine'}</div>
                          {item.brand && item.generic && <div className="mt-0.5 text-xs text-slate-500">{item.generic}</div>}
                          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                            <div><dt className="text-xs text-slate-500">Dose</dt><dd className="text-slate-700">{item.dose || '—'}</dd></div>
                            <div><dt className="text-xs text-slate-500">Frequency</dt><dd className="text-slate-700">{item.frequency || '—'}</dd></div>
                            <div><dt className="text-xs text-slate-500">Duration</dt><dd className="text-slate-700">{item.duration || '—'}</dd></div>
                            <div className="col-span-2 sm:col-span-4"><dt className="text-xs text-slate-500">Instructions</dt><dd className="whitespace-pre-wrap text-slate-700">{item.instructions || '—'}</dd></div>
                          </dl>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">No medicine details recorded.</p>
                  )}
                </section>
              </div>
            </article>
          )}
        </>
      )}
    </div>
  )
}
