// src/pages/PrescriptionEditor.tsx
import React, { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Plus, Save, Stethoscope, Trash2, Zap } from 'lucide-react'
import { createClientId, db } from '../services/db'
import { Patient, PrescriptionItem } from '../types'
import MedicineInput from '../components/MedicineInput'
import SignaturePad from '../components/SignaturePad'
import { useAuth } from '../services/auth'
import { filterTenantRecords } from '../services/tenant'
import { buildPrescriptionPayload, getPrescriptionDraftStorageKey, normalizePrescriptionItems } from '../services/prescription'
import { generatePrescriptionQrDataUrl } from '../services/prescriptionQr'

const clinicPresets = [
  { id: 'general', label: 'General practice', department: 'Family medicine', mark: 'GP' },
  { id: 'cardiology', label: 'Cardiology', department: 'Cardiovascular medicine', mark: 'CV' },
  { id: 'pediatrics', label: 'Pediatrics', department: "Children's medicine", mark: 'PD' },
  { id: 'dental', label: 'Dental', department: 'Dentistry', mark: 'DT' },
  { id: 'dermatology', label: 'Dermatology', department: 'Skin and dermatology', mark: 'DR' },
]

function getPatientAge(dateOfBirth?: string | null) {
  if (!dateOfBirth) return ''
  const [year, month, day] = dateOfBirth.split('-').map(Number)
  if (!year || !month || !day) return ''

  const today = new Date()
  let age = today.getFullYear() - year
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age -= 1
  return String(Math.max(0, age))
}

function getPatientId(patient: Patient) {
  return Number(patient.id)
}

export default function PrescriptionEditor() {
  const loc = useLocation()
  const patientId = (loc.state as any)?.patientId
  const { user } = useAuth()
  const draftStorageKey = user
    ? getPrescriptionDraftStorageKey({ userId: user.id, tenantId: user.tenant_id, subTenantId: user.sub_tenant_id })
    : null
  const [items, setItems] = useState<PrescriptionItem[]>([
    { generic: '', brand: '', dose: '', frequency: '', duration: '', instructions: '' },
  ])
  const [availablePatients, setAvailablePatients] = useState<Patient[]>([])
  const [notes, setNotes] = useState('')
  const [patientName, setPatientName] = useState('')
  const [patientPhone, setPatientPhone] = useState('')
  const [doctorName, setDoctorName] = useState(user?.full_name || '')
  const [doctorRegNo, setDoctorRegNo] = useState('')
  const [doctorQualifications, setDoctorQualifications] = useState('')
  const [clinicName, setClinicName] = useState('')
  const [clinicRegNo, setClinicRegNo] = useState('')
  const [clinicAddress, setClinicAddress] = useState('')
  const [clinicPhone, setClinicPhone] = useState('')
  const [clinicPreset, setClinicPreset] = useState('general')
  const [department, setDepartment] = useState('Family medicine')
  const [patientIdNo, setPatientIdNo] = useState(patientId ? String(patientId) : '')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState('')
  const [prescriptionNo, setPrescriptionNo] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [warnings, setWarnings] = useState('')
  const [pharmacistName, setPharmacistName] = useState('')
  const [stampText, setStampText] = useState('')
  const [isEmergency, setIsEmergency] = useState(false)
  const [signature, setSignature] = useState('')
  const [savedPrescriptionId, setSavedPrescriptionId] = useState<string | number | null>(null)
  const [localPatientId, setLocalPatientId] = useState<number | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine)

  const LOCAL_BRANDS = [
    'Napa 500mg',
    'Seclo 100mg',
    'Paracetamol 500mg',
    'Omeprazole 20mg',
    'Amoxicillin 500mg',
  ]

  useEffect(() => {
    setDoctorName(user?.full_name || '')
  }, [user])

  useEffect(() => {
    let cancelled = false
    const loadPatients = async () => {
      if (!user) return

      const allPatients = await db.patients.toArray()
      const scopedPatients = filterTenantRecords(allPatients, user.scope)
      if (cancelled) return

      setAvailablePatients(scopedPatients)
      if (patientId === undefined || patientId === null) {
        setLocalPatientId(null)
        return
      }

      const numericId = Number(patientId)
      const patient = scopedPatients.find((candidate) => Number(candidate.id) === numericId)
        || scopedPatients.find((candidate) => candidate.cloud_id === String(patientId))
      if (!patient?.id) {
        setLocalPatientId(null)
        setStatusMessage('Selected patient is not available in this clinic. Choose a patient from the list.')
        return
      }

      setLocalPatientId(getPatientId(patient))
      setPatientName(patient.name)
      setPatientPhone(patient.phone || '')
      setPatientIdNo(String(patient.hospital_id || patient.id))
      setGender(patient.gender || '')
      setAge(getPatientAge(patient.date_of_birth))
    }

    void loadPatients().catch((error) => {
      console.error('Unable to load patient for prescription', error)
      setStatusMessage('Unable to load clinic patients.')
    })

    return () => {
      cancelled = true
    }
  }, [patientId, user])

  useEffect(() => {
    if (savedPrescriptionId === null) {
      setQrDataUrl('')
      return
    }

    generatePrescriptionQrDataUrl(savedPrescriptionId).then(setQrDataUrl).catch(() => setStatusMessage('Could not generate prescription QR code'))
  }, [savedPrescriptionId])

  useEffect(() => {
    if (!draftStorageKey) return

    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    try {
      const d = localStorage.getItem(draftStorageKey)
      if (d) {
        const draft = JSON.parse(d)
        setPatientName(draft.patientName || '')
        setItems(draft.items || items)
        setNotes(draft.notes || '')
      }
    } catch (e) {
      // ignore
    }

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftStorageKey])

  useEffect(() => {
    if (!draftStorageKey) return

    const id = setInterval(() => {
      const draft = { patientName, items, notes, updatedAt: Date.now() }
      localStorage.setItem(draftStorageKey, JSON.stringify(draft))
      setStatusMessage('Draft autosaved')
      setTimeout(() => setStatusMessage(null), 1200)
    }, 20000)
    return () => clearInterval(id)
  }, [patientName, items, notes, draftStorageKey])

  const addRow = () =>
    setItems((s) => [...s, { generic: '', brand: '', dose: '', frequency: '', duration: '', instructions: '' }])

  const selectPatient = (id: string) => {
    const patient = availablePatients.find((candidate) => String(candidate.id) === id)
    if (!patient?.id) {
      setLocalPatientId(null)
      setPatientName('')
      setPatientPhone('')
      setPatientIdNo('')
      setAge('')
      setGender('')
      return
    }

    setLocalPatientId(getPatientId(patient))
    setPatientName(patient.name)
    setPatientPhone(patient.phone || '')
    setPatientIdNo(String(patient.hospital_id || patient.id))
    setAge(getPatientAge(patient.date_of_birth))
    setGender(patient.gender || '')
  }

  const updateItem = (idx: number, partial: Partial<PrescriptionItem>) => {
    setItems((s) => {
      const copy = [...s]
      copy[idx] = { ...copy[idx], ...partial }
      return copy
    })
  }

  const validate = () => {
    if (!localPatientId) return 'Select a saved patient record before creating a prescription.'
    if (!patientName.trim()) return 'Patient name is required'
    const hasItem = normalizePrescriptionItems(items).length > 0
    if (!hasItem) return 'Add at least one medicine'
    return null
  }

  const printableItems = normalizePrescriptionItems(items)
  const printedDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const followUpLabel = followUpDate ? new Date(followUpDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
  const selectedPreset = clinicPresets.find((preset) => preset.id === clinicPreset) || clinicPresets[0]

  const save = async () => {
    const v = validate()
    if (v) {
      setStatusMessage(v)
      setTimeout(() => setStatusMessage(null), 2500)
      return
    }

    const normalizedItems = normalizePrescriptionItems(items)

    setSaving(true)
    try {
      if (!user) throw new Error('Sign in with a clinic account before saving a prescription.')
      const clientId = createClientId()
      const savedPrescriptionNo = prescriptionNo.trim() || `RX-${new Date().getFullYear()}-${clientId.slice(0, 8).toUpperCase()}`
      setPrescriptionNo(savedPrescriptionNo)
      const payload = buildPrescriptionPayload(
        '',
        normalizedItems,
        notes,
        user.id,
        user.tenant_id,
        user.sub_tenant_id,
        {
          clinic_name: clinicName,
          clinic_reg_no: clinicRegNo,
          clinic_address: clinicAddress,
          clinic_phone: clinicPhone,
          clinic_preset: clinicPreset,
          department,
          patient_name: patientName,
          patient_phone: patientPhone,
          patient_id_no: patientIdNo,
          age,
          gender,
          prescription_no: savedPrescriptionNo,
          follow_up_date: followUpDate,
          warnings,
          pharmacist_name: pharmacistName,
          stamp_text: stampText,
          is_emergency: isEmergency,
          doctor_name: doctorName,
          doctor_reg_no: doctorRegNo,
          doctor_qualifications: doctorQualifications,
          signature_data_url: signature || undefined,
        },
      )
      const { visit_id: _visitId, ...prescriptionPayload } = payload
      const prescription = { ...prescriptionPayload, client_id: clientId }
      const { prescriptionId: savedId } = await db.createVisitAndPrescription(
        {
          patient_id: String(localPatientId),
          tenant_id: user.tenant_id,
          sub_tenant_id: user.sub_tenant_id,
          visit_type: 'walk-in',
          specialty: 'general',
          status: 'done',
          created_at: new Date().toISOString(),
        },
        prescription,
      )
      setSavedPrescriptionId(savedId)
      setStatusMessage(`Saved locally; cloud sync queued (id: ${savedId}) ${isOnline ? '(online)' : '(offline)'}`)
      if (draftStorageKey) localStorage.removeItem(draftStorageKey)
    } catch (err) {
      console.error(err)
      setStatusMessage('Failed to save prescription')
    } finally {
      setSaving(false)
      setTimeout(() => setStatusMessage(null), 3000)
    }
  }

  const removeRow = (idx: number) => setItems((s) => s.filter((_, i) => i !== idx))

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="soft-card overflow-hidden">
        <div className="border-b border-slate-200 bg-gradient-to-r from-sky-50 via-white to-emerald-50 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-sm">
                <Stethoscope className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Clinical workflow</p>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900">Prescription</h2>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                {isOnline ? 'Online' : 'Offline'}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
                {user?.sub_tenant_id || 'Primary clinic'}
              </span>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className={`print-paper mb-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm brand-${clinicPreset} ${isEmergency ? 'emergency-print' : ''}`}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div className="logo-block">
                <div className="logo-mark">{selectedPreset.mark}</div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{department}</p>
                  <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-900">{clinicName || 'Clinic name'}</h3>
                  <p className="mt-1 text-sm text-slate-600">{clinicAddress || selectedPreset.label}</p>
                  {clinicPhone && <p className="text-xs text-slate-600">Tel: {clinicPhone}</p>}
                </div>
              </div>

              <div className="text-right text-sm text-slate-600">
                <div className="font-semibold text-slate-800">{doctorName || 'Clinician name'}</div>
                {doctorQualifications && <div>{doctorQualifications}</div>}
                <div>Practitioner reg.: {doctorRegNo || 'Not supplied'}</div>
                <div>Facility reg.: {clinicRegNo || 'Not supplied'}</div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 border-b border-slate-200 pb-4 md:grid-cols-2 lg:grid-cols-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Patient</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{patientName || 'Patient Name'}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Patient ID</p>
                <p className="mt-1 text-base text-slate-700">{patientIdNo || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Age / Sex</p>
                <p className="mt-1 text-base text-slate-700">{age || '—'} / {gender || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Phone</p>
                <p className="mt-1 text-base text-slate-700">{patientPhone || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Prescription No</p>
                <p className="mt-1 text-base font-semibold text-slate-800">{prescriptionNo || '—'}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 border-b border-slate-200 pb-4 md:grid-cols-[1.3fr_0.7fr]">
              <div className="registry-seal">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Facility registration</p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">{clinicName || 'Clinic name'}</p>
                  </div>
                  <div className="registry-seal-badge">Facility</div>
                </div>
                <div className="mt-3 flex items-center gap-3 text-xs text-slate-600">
                  <span>Registration: {clinicRegNo || 'Not supplied'}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Prescription record ID</p>
                  <p className="mt-1 text-xs text-slate-600">{savedPrescriptionId ?? 'Save to generate'}</p>
                </div>
                {qrDataUrl ? <img className="qr-image" src={qrDataUrl} alt={`QR code for prescription record ${savedPrescriptionId}`} /> : <div className="qr-pending">QR</div>}
              </div>
            </div>

            <div className="duplicate-copy mt-5 flex items-center justify-between gap-3 px-3 py-2">
              <span>Duplicate copy</span>
              <span>Patient copy</span>
              <span>Pharmacy copy</span>
            </div>

            <div className="mt-5 grid gap-4 border-b border-slate-200 pb-4 md:grid-cols-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Date</p>
                <p className="mt-1 text-base text-slate-700">{printedDate}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Follow-up</p>
                <p className="mt-1 text-base text-slate-700">{followUpLabel}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Department</p>
                <p className="mt-1 text-base text-slate-700">{department}</p>
              </div>
            </div>

            <div className={`mt-5 ${isEmergency ? 'emergency-layout' : ''}`}>
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="px-3 py-3 font-semibold">#</th>
                      <th className="px-3 py-3 font-semibold">Medicine</th>
                      <th className="px-3 py-3 font-semibold">Dose</th>
                      <th className="px-3 py-3 font-semibold">Frequency</th>
                      <th className="px-3 py-3 font-semibold">Duration</th>
                      <th className="px-3 py-3 font-semibold">Instructions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printableItems.length > 0 ? printableItems.map((it, idx) => (
                      <tr key={`${it.brand || it.generic || idx}-${idx}`} className="border-t border-slate-200 align-top">
                        <td className="px-3 py-3 font-medium text-slate-600">{idx + 1}</td>
                        <td className="px-3 py-3">
                          <div className="font-medium text-slate-800">{it.brand || it.generic || '—'}</div>
                          <div className="text-slate-500">{it.generic || '—'}</div>
                        </td>
                        <td className="px-3 py-3 text-slate-700">{it.dose || '—'}</td>
                        <td className="px-3 py-3 text-slate-700">{it.frequency || '—'}</td>
                        <td className="px-3 py-3 text-slate-700">{it.duration || '—'}</td>
                        <td className="px-3 py-3 text-slate-700">{it.instructions || '—'}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-slate-500">No medicine added yet</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {isEmergency && (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Clinical notes</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{notes || 'No additional notes.'}</p>
                  </div>
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">Warnings / contraindications</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-900">{warnings || 'No specific warnings.'}</p>
                    </div>
                    <div className="signature-box">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Patient signature</p>
                      <div className="signature-line" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {!isEmergency && (
              <div className="mt-5 grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Clinical notes</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{notes || 'No additional notes.'}</p>
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">Warnings / contraindications</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-900">{warnings || 'No specific warnings.'}</p>
                </div>
              </div>
            )}

            <div className="mt-6 grid gap-4 md:grid-cols-4">
              <div className="signature-box">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Clinician signature</p>
                {signature ? <img className="printed-signature" src={signature} alt="Drawn clinician signature" /> : <div className="signature-line" />}
                <div className="mt-2 text-sm font-semibold text-slate-800">{doctorName}</div>
              </div>
              <div className="digital-sig">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Registration</p>
                <div className="mt-2 text-sm font-medium text-slate-700">{doctorRegNo}</div>
                <div className="digital-sig-line" />
              </div>
              <div className="signature-box">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Pharmacist</p>
                <div className="mt-2 text-sm font-medium text-slate-700">{pharmacistName}</div>
              </div>
              <div className="signature-box stamp-box">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Official stamp</p>
                <div className="stamp-badge">{stampText}</div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="digital-sig">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Signature method</p>
                <div className="mt-2 text-sm font-medium text-slate-700">Drawn signature image; certificate identity not independently verified.</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 print-redundant-section">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Additional instructions</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{notes || 'No additional instructions.'}</p>
              </div>
            </div>

            <div className="footer-strip mt-6">
              <span>Practitioner reg.: {doctorRegNo || 'Not supplied'}</span>
              <span>Follow-up: {followUpLabel}</span>
              <span>{clinicPhone ? `Contact: ${clinicPhone}` : clinicName || 'Clinic'}</span>
            </div>
          </div>

          <fieldset disabled={savedPrescriptionId !== null} className="mb-6 grid min-w-0 gap-4 border-0 p-0 md:grid-cols-2 xl:grid-cols-4 no-print">
            <label className="block xl:col-span-2">
              <span className="field-label">Select saved patient</span>
              <select className="field-input" value={localPatientId ?? ''} onChange={(event) => selectPatient(event.target.value)}>
                <option value="">Choose a patient</option>
                {availablePatients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name} · {patient.hospital_id || patient.id}
                  </option>
                ))}
              </select>
              {!availablePatients.length && <Link to="/patients/new" className="mt-1 inline-block text-xs font-medium text-sky-700">Register a patient</Link>}
            </label>
            <label className="block">
              <span className="field-label">Specialty branding</span>
              <select className="field-input" value={clinicPreset} onChange={(e) => {
                const preset = clinicPresets.find((item) => item.id === e.target.value)
                if (!preset) return
                setClinicPreset(preset.id)
                setDepartment(preset.department)
              }}>
                {clinicPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="field-label">Doctor name</span>
              <input className="field-input" value={doctorName} onChange={(e) => setDoctorName(e.target.value)} />
            </label>
            <label className="block">
              <span className="field-label">Practitioner registration no</span>
              <input className="field-input" value={doctorRegNo} onChange={(e) => setDoctorRegNo(e.target.value)} />
            </label>
            <label className="block">
              <span className="field-label">Qualifications</span>
              <input className="field-input" value={doctorQualifications} onChange={(e) => setDoctorQualifications(e.target.value)} placeholder="Enter verified credentials" />
            </label>
            <label className="block">
              <span className="field-label">Clinic name</span>
              <input className="field-input" value={clinicName} onChange={(e) => setClinicName(e.target.value)} />
            </label>
            <label className="block">
              <span className="field-label">Facility registration no</span>
              <input className="field-input" value={clinicRegNo} onChange={(e) => setClinicRegNo(e.target.value)} />
            </label>
            <label className="block">
              <span className="field-label">Clinic address</span>
              <input className="field-input" value={clinicAddress} onChange={(e) => setClinicAddress(e.target.value)} />
            </label>
            <label className="block">
              <span className="field-label">Clinic phone</span>
              <input className="field-input" value={clinicPhone} onChange={(e) => setClinicPhone(e.target.value)} />
            </label>
            <label className="block">
              <span className="field-label">Department</span>
              <input className="field-input" value={department} onChange={(e) => setDepartment(e.target.value)} />
            </label>
            <label className="block">
              <span className="field-label">Prescription no</span>
              <input className="field-input" value={prescriptionNo} onChange={(e) => setPrescriptionNo(e.target.value)} />
            </label>
            <label className="block">
              <span className="field-label">Patient name</span>
              <input className="field-input" value={patientName} onChange={(e) => setPatientName(e.target.value)} placeholder="Select a saved patient" />
            </label>
            <label className="block">
              <span className="field-label">Patient ID</span>
              <input className="field-input" value={patientIdNo} onChange={(e) => setPatientIdNo(e.target.value)} />
            </label>
            <label className="block">
              <span className="field-label">Age</span>
              <input className="field-input" value={age} onChange={(e) => setAge(e.target.value)} placeholder="32" />
            </label>
            <label className="block">
              <span className="field-label">Gender</span>
              <select className="field-input" value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </label>
            <label className="block">
              <span className="field-label">Follow-up date</span>
              <input type="date" className="field-input" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
            </label>
            <label className="block">
              <span className="field-label">Pharmacist</span>
              <input className="field-input" value={pharmacistName} onChange={(e) => setPharmacistName(e.target.value)} />
            </label>
            <label className="block">
              <span className="field-label">Official stamp</span>
              <input className="field-input" value={stampText} onChange={(e) => setStampText(e.target.value)} />
            </label>
            <div className="flex items-end">
              <label className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                <span>Emergency format</span>
                <input type="checkbox" checked={isEmergency} onChange={(e) => setIsEmergency(Boolean(e.target.checked))} className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
              </label>
            </div>
          </fieldset>

          <fieldset disabled={savedPrescriptionId !== null} className="mb-6 min-w-0 border-0 p-0 no-print">
            <label className="field-label">Clinician signature</label>
            <SignaturePad value={signature} onChange={setSignature} disabled={savedPrescriptionId !== null} />
          </fieldset>

          <fieldset disabled={savedPrescriptionId !== null} className="mb-6 flex min-w-0 flex-wrap items-center gap-2 border-0 p-0 no-print">
            {LOCAL_BRANDS.map((brand) => (
              <button key={brand} type="button" className="chip" onClick={() => {
                const next = brand.split(' ')
                const generic = next.slice(0, -1).join(' ')
                const suffix = next[next.length - 1] || ''
                setItems((s) => {
                  const copy = [...s]
                  const target = copy[copy.length - 1] || { generic: '', brand: '', dose: '', frequency: '', duration: '', instructions: '' }
                  copy[copy.length - 1] = { ...target, generic, brand, dose: suffix }
                  return copy
                })
              }}>
                {brand}
              </button>
            ))}
          </fieldset>

          <fieldset disabled={savedPrescriptionId !== null} className="space-y-4 min-w-0 border-0 p-0 no-print">
            {items.map((it, idx) => (
              <div key={idx} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-700">Medicine {idx + 1}</p>
                  {items.length > 1 && (
                    <button type="button" className="action-button-danger" onClick={() => removeRow(idx)}>
                      <Trash2 className="mr-1.5 h-4 w-4" /> Remove
                    </button>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                  <div className="xl:col-span-2">
                    <label className="field-label">Generic</label>
                    <input className="field-input" placeholder="Paracetamol" value={it.generic} onChange={(e) => updateItem(idx, { generic: e.target.value })} />
                  </div>
                  <div className="xl:col-span-1">
                    <label className="field-label">Brand</label>
                    <input className="field-input" placeholder="Napa" value={it.brand} onChange={(e) => updateItem(idx, { brand: e.target.value })} />
                  </div>
                  <div className="xl:col-span-1">
                    <label className="field-label">Dose</label>
                    <input className="field-input" placeholder="500mg" value={it.dose} onChange={(e) => updateItem(idx, { dose: e.target.value })} />
                  </div>
                  <div className="xl:col-span-1">
                    <label className="field-label">Frequency</label>
                    <input className="field-input" placeholder="1-0-1" value={it.frequency} onChange={(e) => updateItem(idx, { frequency: e.target.value })} />
                  </div>
                  <div className="xl:col-span-1">
                    <label className="field-label">Duration</label>
                    <input className="field-input" placeholder="5 days" value={it.duration} onChange={(e) => updateItem(idx, { duration: e.target.value })} />
                  </div>
                  <div className="xl:col-span-6">
                    <label className="field-label">Instructions</label>
                    <textarea className="field-textarea" placeholder="After food, avoid missed dose" value={it.instructions} onChange={(e) => updateItem(idx, { instructions: e.target.value })} />
                  </div>
                </div>
              </div>
            ))}
          </fieldset>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 no-print">
            <button type="button" className="action-button-secondary" onClick={addRow} disabled={savedPrescriptionId !== null}>
              <Plus className="mr-1.5 h-4 w-4" /> Add medicine
            </button>

            <div className="flex items-center gap-2">
              <button type="button" className="action-button-secondary" onClick={() => window.print()} disabled={!localPatientId || printableItems.length === 0} title={!localPatientId ? 'Select a saved patient first' : printableItems.length === 0 ? 'Add a medicine first' : 'Open print preview'}>
                <Zap className="mr-1.5 h-4 w-4" /> Print / Preview
              </button>
              <button type="button" className="action-button-primary" onClick={save} disabled={saving || savedPrescriptionId !== null}>
                <Save className="mr-1.5 h-4 w-4" />
                {saving ? 'Saving...' : savedPrescriptionId !== null ? `Saved (${savedPrescriptionId})` : 'Save prescription'}
              </button>
              {savedPrescriptionId !== null && <Link className="action-button-secondary" to="/prescriptions">Records</Link>}
            </div>
          </div>

          <fieldset disabled={savedPrescriptionId !== null} className="mt-6 min-w-0 border-0 p-0 no-print">
            <label className="field-label">Clinical notes</label>
            <textarea className="field-textarea" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add diagnosis notes, follow-up advice, or caution" />
          </fieldset>

          <fieldset disabled={savedPrescriptionId !== null} className="mt-4 min-w-0 border-0 p-0 no-print">
            <label className="field-label">Warnings / contraindications</label>
            <textarea className="field-textarea" rows={3} value={warnings} onChange={(e) => setWarnings(e.target.value)} placeholder="List drug warnings, contraindications, or caution" />
          </fieldset>

          <fieldset disabled={savedPrescriptionId !== null} className="mt-4 min-w-0 border-0 p-0 no-print">
            <label className="field-label">Medicines (quick add)</label>
            <MedicineInput
              value={items.map((it) => ({ name: it.brand || it.generic || '' }))}
              onChange={(m) => setItems(m.map((mm) => ({ generic: mm.name, brand: mm.name })) as any)}
              suggestions={LOCAL_BRANDS}
            />
          </fieldset>

          <p className="mt-4 text-xs text-slate-500 no-print">The drawn signature image is saved with this prescription; it is not a certificate-backed electronic signature.</p>

          {statusMessage && (
            <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 no-print">
              {statusMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
