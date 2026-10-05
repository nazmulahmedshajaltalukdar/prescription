import { Appointment, Patient, Prescription, Visit } from '../types'
import { AuthUser } from './auth'
import { createClientId, db } from './db'
import { getStorage } from './storage'
import { isSupabaseConfigured, supabase } from './supabaseClient'
import { filterTenantRecords } from './tenant'

export type AppointmentRequestSource = 'phone' | 'whatsapp' | 'facebook' | 'website' | 'walk_in' | 'other'
export type AppointmentRequestStatus = 'new' | 'contacted' | 'booked' | 'cancelled' | 'completed' | 'no_show'

export interface AppointmentRequest {
  id: string
  client_id: string
  tenant_id: string
  sub_tenant_id: string
  patient_id: string | null
  patient_name: string
  patient_phone: string
  source: AppointmentRequestSource
  requested_at: string | null
  specialty: string
  reason: string | null
  promotion_code: string | null
  status: AppointmentRequestStatus
  appointment_id: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface AppointmentRequestInput {
  patientId?: string | null
  patientName: string
  patientPhone: string
  source: AppointmentRequestSource
  requestedAt?: string | null
  specialty: string
  reason?: string
  promotionCode?: string
}

export interface PatientMatch {
  id: string
  name: string
  phone: string | null
  date_of_birth: string | null
  gender: string | null
  visit_count: number
  prescription_count: number
  last_visit_at: string | null
}

const localStoragePrefix = 'clinic:appointment-requests'

export function normalizePhone(value: string) {
  return value.replace(/\D/g, '')
}

export function findPhoneMatches<T extends { phone?: string | null }>(patients: T[], phone: string) {
  const digits = normalizePhone(phone)
  if (digits.length < 7) return []
  const suffix = digits.slice(-7)
  return patients.filter((patient) => normalizePhone(patient.phone || '').includes(suffix))
}

function getLocalKey(user: AuthUser) {
  return `${localStoragePrefix}:${encodeURIComponent(user.tenant_id)}:${encodeURIComponent(user.sub_tenant_id || '')}`
}

function getLocalRequests(user: AuthUser): AppointmentRequest[] {
  const raw = getStorage()?.getItem(getLocalKey(user))
  if (!raw) return []
  const records: unknown = JSON.parse(raw)
  if (!Array.isArray(records)) throw new Error('Saved appointment requests are not a list.')
  return records as AppointmentRequest[]
}

function saveLocalRequests(user: AuthUser, records: AppointmentRequest[]) {
  const storage = getStorage()
  if (!storage) throw new Error('Browser storage is unavailable.')
  storage.setItem(getLocalKey(user), JSON.stringify(records))
}

function validateRequest(input: AppointmentRequestInput) {
  const name = input.patientName.trim()
  const phone = input.patientPhone.trim()
  const specialty = input.specialty.trim()
  if (!name || name.length > 120) throw new Error('Enter a patient name (up to 120 characters).')
  if (normalizePhone(phone).length < 7 || phone.length > 40) throw new Error('Enter a valid phone number.')
  if (!specialty || specialty.length > 120) throw new Error('Enter a specialty (up to 120 characters).')
  if ((input.reason || '').length > 1000) throw new Error('The request note must be 1000 characters or fewer.')
  if ((input.promotionCode || '').trim().length > 80) throw new Error('The offer/referral code must be 80 characters or fewer.')
}

export async function listAppointmentRequests(user: AuthUser): Promise<AppointmentRequest[]> {
  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase
      .from('appointment_requests')
      .select('*')
      .eq('tenant_id', user.tenant_id)
      .eq('sub_tenant_id', user.sub_tenant_id || '')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []) as AppointmentRequest[]
  }
  return getLocalRequests(user).sort((left, right) => right.created_at.localeCompare(left.created_at))
}

export async function createAppointmentRequest(user: AuthUser, input: AppointmentRequestInput) {
  validateRequest(input)
  const now = new Date().toISOString()
  const record = {
    client_id: createClientId(),
    tenant_id: user.tenant_id,
    sub_tenant_id: user.sub_tenant_id || '',
    patient_id: input.patientId || null,
    patient_name: input.patientName.trim(),
    patient_phone: input.patientPhone.trim(),
    source: input.source,
    requested_at: input.requestedAt ? new Date(input.requestedAt).toISOString() : null,
    specialty: input.specialty.trim(),
    reason: input.reason?.trim() || null,
    promotion_code: input.promotionCode?.trim() || null,
    status: 'new' as const,
    appointment_id: null,
    created_by: user.id,
    created_at: now,
    updated_at: now,
  }
  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase.from('appointment_requests').insert(record).select('*').single()
    if (error) throw error
    return data as AppointmentRequest
  }
  const local = { ...record, id: record.client_id }
  saveLocalRequests(user, [local, ...getLocalRequests(user)])
  return local
}

export async function updateAppointmentRequest(
  user: AuthUser,
  request: AppointmentRequest,
  changes: Partial<Pick<AppointmentRequest, 'status' | 'patient_id'>>,
) {
  const updatedAt = new Date().toISOString()
  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase
      .from('appointment_requests')
      .update({ ...changes, updated_at: updatedAt })
      .eq('id', request.id)
      .select('*')
      .single()
    if (error) throw error
    return data as AppointmentRequest
  }
  const updated = { ...request, ...changes, updated_at: updatedAt }
  saveLocalRequests(user, getLocalRequests(user).map((item) => item.id === request.id ? updated : item))
  return updated
}

export async function searchPatientsByPhone(user: AuthUser, phone: string): Promise<PatientMatch[]> {
  const digits = normalizePhone(phone)
  if (digits.length < 7) return []
  if (isSupabaseConfigured() && supabase) {
    const { data: patients, error } = await supabase
      .from('patients')
      .select('id, name, phone, date_of_birth, gender')
      .eq('tenant_id', user.tenant_id)
      .ilike('phone', `%${digits.slice(-7)}%`)
      .limit(10)
    if (error) throw error
    const rows = (patients || []).filter((patient) => normalizePhone(patient.phone || '').includes(digits.slice(-7)))
    if (!rows.length) return []

    const patientIds = rows.map((patient) => patient.id)
    const { data: visits, error: visitsError } = await supabase
      .from('visits')
      .select('id, patient_id, created_at')
      .eq('tenant_id', user.tenant_id)
      .in('patient_id', patientIds)
    if (visitsError) throw visitsError
    const visitRows = visits || []
    const visitIds = visitRows.map((visit) => visit.id)
    const prescriptionCounts = new Map<string, number>()
    if (visitIds.length) {
      const { data: prescriptions, error: prescriptionsError } = await supabase
        .from('prescriptions')
        .select('visit_id')
        .eq('tenant_id', user.tenant_id)
        .in('visit_id', visitIds)
      if (prescriptionsError) throw prescriptionsError
      for (const prescription of prescriptions || []) {
        prescriptionCounts.set(prescription.visit_id, (prescriptionCounts.get(prescription.visit_id) || 0) + 1)
      }
    }
    return rows.map((patient) => {
      const patientVisits = visitRows.filter((visit) => visit.patient_id === patient.id)
      return {
        ...patient,
        visit_count: patientVisits.length,
        prescription_count: patientVisits.reduce((sum, visit) => sum + (prescriptionCounts.get(visit.id) || 0), 0),
        last_visit_at: patientVisits.map((visit) => visit.created_at).sort().at(-1) || null,
      }
    })
  }

  const scopedPatients = filterTenantRecords(await db.patients.toArray(), user.scope)
  const matched = findPhoneMatches(scopedPatients, phone)
  const visits = filterTenantRecords(await db.visits.toArray(), user.scope)
  const prescriptions = filterTenantRecords(await db.prescriptions.toArray(), user.scope)
  return matched.map((patient: Patient) => {
    const patientVisits = visits.filter((visit: Visit) => String(visit.patient_id) === String(patient.id))
    const visitIds = new Set(patientVisits.map((visit: Visit) => String(visit.id)))
    return {
      id: String(patient.id),
      name: patient.name,
      phone: patient.phone || null,
      date_of_birth: patient.date_of_birth || null,
      gender: patient.gender || null,
      visit_count: patientVisits.length,
      prescription_count: prescriptions.filter((prescription: Prescription) => visitIds.has(String(prescription.visit_id))).length,
      last_visit_at: patientVisits.map((visit: Visit) => visit.created_at || '').sort().at(-1) || null,
    }
  })
}

export async function scheduleAppointmentFromRequest(
  user: AuthUser,
  request: AppointmentRequest,
  startAt: string,
) {
  if (!request.patient_id) throw new Error('Link a confirmed patient record before booking this request.')
  const start = new Date(startAt)
  if (Number.isNaN(start.getTime())) throw new Error('Choose a valid appointment time.')
  const now = new Date().toISOString()

  if (isSupabaseConfigured() && supabase) {
    const appointmentClientId = request.client_id
    const { data: appointment, error: appointmentError } = await supabase
      .from('appointments')
      .upsert({
        client_id: appointmentClientId,
        tenant_id: user.tenant_id,
        sub_tenant_id: user.sub_tenant_id || '',
        patient_id: request.patient_id,
        patient_name: request.patient_name,
        start_at: start.toISOString(),
        duration_minutes: 20,
        specialty: request.specialty,
        reason: request.reason,
        status: 'scheduled',
        created_by: user.id,
        created_at: now,
      }, { onConflict: 'client_id' })
      .select('id')
      .single()
    if (appointmentError) throw appointmentError
    const { data, error } = await supabase
      .from('appointment_requests')
      .update({ status: 'booked', appointment_id: appointment.id, updated_at: now })
      .eq('id', request.id)
      .select('*')
      .single()
    if (error) throw error
    return data as AppointmentRequest
  }

  const patient = await db.patients.get(Number(request.patient_id))
  if (!patient) throw new Error('Patient record is unavailable in this browser.')
  const appointment: Appointment = {
    tenant_id: user.tenant_id,
    sub_tenant_id: user.sub_tenant_id,
    patient_id: String(patient.id),
    patient_name: request.patient_name,
    start_at: start.toISOString(),
    duration_minutes: 20,
    specialty: request.specialty,
    reason: request.reason || undefined,
    status: 'scheduled',
    created_by: user.id,
    created_at: now,
  }
  const [{ id }] = await db.createRecordsWithSync([{ table: 'appointments', item: appointment }])
  const updated = { ...request, status: 'booked' as const, appointment_id: String(id), updated_at: now }
  saveLocalRequests(user, getLocalRequests(user).map((item) => item.id === request.id ? updated : item))
  return updated
}
