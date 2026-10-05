// src/services/db.ts
import Dexie, { Table } from 'dexie'
import { Appointment, Patient, Visit, Prescription, Drug, PharmacyPrescriptionLink, SerialTicket } from '../types'
import { supabase } from './supabaseClient'

type SyncTableName = 'patients' | 'visits' | 'prescriptions' | 'appointments' | 'serialTickets'

interface SyncQueueEntry {
  id?: number
  table: SyncTableName
  item: Record<string, any>
  op: 'create' | 'update' | 'delete'
  created_at: string
  last_error?: string
}

export function createClientId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function isRemoteSerialTicket(value: unknown): value is {
  id: string
  serial_number: number
  display_code: string
  status: SerialTicket['status']
} {
  if (!value || typeof value !== 'object') return false
  const ticket = value as Record<string, unknown>
  return (
    typeof ticket.id === 'string' &&
    typeof ticket.serial_number === 'number' &&
    typeof ticket.display_code === 'string' &&
    typeof ticket.status === 'string' &&
    ['waiting', 'in_consult', 'completed', 'cancelled'].includes(ticket.status)
  )
}

function getRemoteTableName(table: SyncTableName) {
  return table === 'serialTickets' ? 'serial_tickets' : table
}

export class ClinicDB extends Dexie {
  patients!: Table<Patient, number>
  visits!: Table<Visit, number>
  prescriptions!: Table<Prescription, number>
  drugs!: Table<Drug, string>
  pharmacyLinks!: Table<PharmacyPrescriptionLink, string>
  appointments!: Table<Appointment, number>
  serialTickets!: Table<SerialTicket, number>
  syncQueue!: Table<SyncQueueEntry, number>
  private activeSync: Promise<void> | null = null

  constructor() {
    super('ClinicDB')
    this.version(1).stores({
      patients: '++id, tenant_id, sub_tenant_id, hospital_id, name, phone, created_at',
      visits: '++id, patient_id, tenant_id, sub_tenant_id, specialty, status, created_at',
      prescriptions: '++id, visit_id, tenant_id, sub_tenant_id, doctor_id, created_at',
      drugs: '++id, generic_name, brand_name, strength',
      pharmacyLinks: '++id, prescription_id, pharmacy_id, status, created_at',
      syncQueue: '++id, table, item, op, created_at',
    })

    this.version(2).stores({
      patients: '++id, tenant_id, sub_tenant_id, hospital_id, name, phone, created_at',
      visits: '++id, patient_id, tenant_id, sub_tenant_id, specialty, status, created_at',
      prescriptions: '++id, visit_id, tenant_id, sub_tenant_id, doctor_id, created_at',
      drugs: '++id, generic_name, brand_name, strength',
      pharmacyLinks: '++id, prescription_id, pharmacy_id, status, created_at',
      appointments: '++id, tenant_id, sub_tenant_id, patient_id, start_at, status, created_at',
      serialTickets: '++id, tenant_id, sub_tenant_id, date_key, [tenant_id+date_key], patient_id, appointment_id, status, created_at',
      syncQueue: '++id, table, item, op, created_at',
    })

    this.version(3).stores({
      patients: '++id, &client_id, cloud_id, tenant_id, sub_tenant_id, hospital_id, name, phone, created_at',
      visits: '++id, &client_id, cloud_id, patient_id, tenant_id, sub_tenant_id, specialty, status, created_at',
      prescriptions: '++id, &client_id, cloud_id, visit_id, tenant_id, sub_tenant_id, doctor_id, created_at',
      drugs: '++id, generic_name, brand_name, strength',
      pharmacyLinks: '++id, prescription_id, pharmacy_id, status, created_at',
      appointments: '++id, &client_id, cloud_id, tenant_id, sub_tenant_id, patient_id, start_at, status, created_at',
      serialTickets: '++id, &client_id, cloud_id, tenant_id, sub_tenant_id, date_key, [tenant_id+date_key], patient_id, appointment_id, status, created_at',
      syncQueue: '++id, table, item, op, created_at',
    }).upgrade(async (transaction) => {
      const syncedTables: SyncTableName[] = ['patients', 'visits', 'prescriptions', 'appointments', 'serialTickets']
      await Promise.all(syncedTables.map((name) => transaction.table(name).toCollection().modify((record: Record<string, any>) => {
        record.client_id ||= createClientId()
        record.sync_state ||= 'pending'
      })))
    })

    this.on('ready', () => {
      // attempt initial sync when ready and online
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        void this.syncWithSupabase().catch((error) => console.error('initial sync failed', error))
      }

      if (typeof window !== 'undefined') {
        window.addEventListener('online', () => void this.syncWithSupabase())
      }
    })
  }

  async createRecordsWithSync(records: Array<{ table: SyncTableName; item: Record<string, any> }>) {
    const uniqueNames = Array.from(new Set(records.map((record) => record.table)))
    const localTables = uniqueNames.map((name) => this.table(name))
    const created: Array<{ table: SyncTableName; id: number }> = []

    await this.transaction('rw', [...localTables, this.syncQueue], async () => {
      for (const entry of records) {
        const record: Record<string, any> = {
          ...entry.item,
          client_id: entry.item.client_id || createClientId(),
          sync_state: 'pending',
        }
        const id = await this.table(entry.table).add(record)
        const queuedRecord = { ...record, id }
        await this.syncQueue.add({ table: entry.table, item: queuedRecord, op: 'create', created_at: new Date().toISOString() })
        created.push({ table: entry.table, id: Number(id) })
      }
    })

    void this.syncWithSupabase()
    return created
  }

  async createVisitAndPrescription(visit: Visit, prescription: Omit<Prescription, 'id' | 'visit_id'>) {
    return this.transaction('rw', this.visits, this.prescriptions, this.syncQueue, async () => {
      const visitRecord = { ...visit, client_id: visit.client_id || createClientId(), sync_state: 'pending' as const }
      const visitId = Number(await this.visits.add(visitRecord))
      const prescriptionRecord = {
        ...prescription,
        visit_id: String(visitId),
        client_id: prescription.client_id || createClientId(),
        sync_state: 'pending' as const,
      }
      const prescriptionId = Number(await this.prescriptions.add(prescriptionRecord))
      const createdAt = new Date().toISOString()

      await this.syncQueue.bulkAdd([
        { table: 'visits', item: { ...visitRecord, id: visitId }, op: 'create', created_at: createdAt },
        {
          table: 'prescriptions',
          item: { ...prescriptionRecord, id: prescriptionId },
          op: 'create',
          created_at: createdAt,
        },
      ])

      return { visitId, prescriptionId }
    }).then((created) => {
      void this.syncWithSupabase()
      return created
    })
  }

  async updateRecordWithSync(table: SyncTableName, id: number, changes: Record<string, any>) {
    const localTable = this.table(table)
    await this.transaction('rw', localTable, this.syncQueue, async () => {
      const current = await localTable.get(id)
      if (!current) throw new Error(`Local ${table} record ${id} was not found`)
      const next = { ...current, ...changes, client_id: current.client_id || createClientId(), sync_state: 'pending' }
      await localTable.put(next)
      await this.syncQueue.add({ table, item: next, op: 'update', created_at: new Date().toISOString() })
    })
    void this.syncWithSupabase()
  }

  async pushToQueue(table: SyncTableName, item: Record<string, any>, op: 'create' | 'update' | 'delete') {
    const queuedItem = { ...item, client_id: item.client_id || createClientId(), sync_state: 'pending' }
    await this.syncQueue.add({ table, item: queuedItem, op, created_at: new Date().toISOString() })
    void this.syncWithSupabase()
  }

  async syncWithSupabase(): Promise<void> {
    const client = supabase
    if (!client || (typeof navigator !== 'undefined' && !navigator.onLine)) return
    if (this.activeSync) return this.activeSync

    this.activeSync = this.runSync(client)
    try {
      await this.activeSync
    } finally {
      this.activeSync = null
    }
  }

  private async runSync(client: NonNullable<typeof supabase>) {
    const queued = await this.syncQueue.orderBy('id').toArray()
    let queueBlocked = false

    for (const entry of queued) {
      try {
        await this.syncQueueEntry(client, entry)
        if (entry.id !== undefined) await this.syncQueue.delete(entry.id)
      } catch (error) {
        if (entry.id !== undefined) {
          await this.syncQueue.update(entry.id, { last_error: error instanceof Error ? error.message : 'Sync failed' })
        }
        console.error(`sync item failed (${entry.table})`, error)
        queueBlocked = true
        break
      }
    }

    try {
      await this.pullRemoteRecords(client)
    } catch (error) {
      console.error('remote pull failed; local data and queued changes were preserved', error)
    }

    if (queueBlocked) return
  }

  private async syncQueueEntry(client: NonNullable<typeof supabase>, entry: SyncQueueEntry) {
    const localTable = this.table(entry.table)
    const record: Record<string, any> = { ...entry.item, client_id: entry.item.client_id || createClientId() }
    const localId = Number(record.id)
    const { data: authData } = await client.auth.getUser()
    const actorId = authData.user?.id

    if (entry.op === 'delete') {
      const remoteTable = getRemoteTableName(entry.table)
      const { error } = await client.from(remoteTable).delete().eq('client_id', record.client_id)
      if (error) throw error
      return
    }

    if (entry.table === 'serialTickets') {
      if (entry.op === 'update') {
        const { data, error } = await client
          .from('serial_tickets')
          .update({ status: record.status })
          .eq('client_id', record.client_id)
          .select('id')
          .maybeSingle()
        if (error) throw error
        if (!data) throw new Error(`Serial ticket ${record.client_id} was not found remotely`)
        if (localId) await localTable.update(localId, { sync_state: 'synced' })
        return
      }

      const patient = await this.patients.get(Number(record.patient_id))
      if (!patient?.client_id) throw new Error('Serial ticket patient has not synced')
      let appointmentClientId: string | null = null
      if (record.appointment_id !== undefined) {
        const appointment = await this.appointments.get(Number(record.appointment_id))
        if (!appointment?.client_id) throw new Error('Serial ticket appointment has not synced')
        appointmentClientId = appointment.client_id
      }
      const { data, error } = await client.rpc('issue_serial_ticket', {
        p_client_id: record.client_id,
        p_patient_client_id: patient.client_id,
        p_appointment_client_id: appointmentClientId,
        p_service_date: record.date_key,
      }).single()
      if (error) throw error
      if (!isRemoteSerialTicket(data)) throw new Error('Supabase returned an invalid serial ticket.')
      if (localId) {
        await localTable.update(localId, {
          cloud_id: data.id,
          serial_number: data.serial_number,
          display_code: data.display_code,
          status: data.status,
          sync_state: 'synced',
        })
      }
      return
    }

    const tableName = getRemoteTableName(entry.table)
    const payload: Record<string, any> = await this.buildRemotePayload(client, entry.table, record, actorId)

    if (entry.op === 'update') {
      const { error } = await client.from(tableName).update(payload).eq('client_id', record.client_id)
      if (error) throw error
      if (localId) await localTable.update(localId, { sync_state: 'synced' })
      return
    }

    const { data, error } = await client.from(tableName).upsert(payload, { onConflict: 'client_id' }).select('id').single()
    if (error) throw error
    if (localId) await localTable.update(localId, { client_id: record.client_id, cloud_id: data.id, sync_state: 'synced' })
  }

  private async buildRemotePayload(
    client: NonNullable<typeof supabase>,
    table: SyncTableName,
    record: Record<string, any>,
    actorId?: string,
  ) {
    const remoteActor = isUuid(actorId) ? actorId : null
    const base = {
      client_id: record.client_id,
      tenant_id: record.tenant_id,
      sub_tenant_id: record.sub_tenant_id,
    }

    if (table === 'patients') {
      return {
        ...base,
        hospital_id: record.hospital_id,
        name: record.name,
        date_of_birth: record.date_of_birth,
        gender: record.gender,
        phone: record.phone,
        address: record.address,
        created_by: remoteActor,
        created_at: record.created_at,
      }
    }

    if (table === 'visits') {
      const patient = await this.patients.get(Number(record.patient_id))
      if (!patient?.client_id) throw new Error('Visit patient has not synced')
      const patientId = await this.getRemoteId(client, 'patients', patient.client_id)
      return {
        ...base,
        patient_id: patientId,
        clinic_id: record.clinic_id,
        visit_type: record.visit_type,
        specialty: record.specialty,
        chief_complaint: record.chief_complaint,
        diagnosis_code: record.diagnosis_code,
        diagnosis_name: record.diagnosis_name,
        diagnosis_system: record.diagnosis_system,
        status: record.status,
        seen_by: remoteActor,
        created_at: record.created_at,
      }
    }

    if (table === 'prescriptions') {
      const visit = await this.visits.get(Number(record.visit_id))
      if (!visit?.client_id) throw new Error('Prescription visit has not synced')
      const visitId = await this.getRemoteId(client, 'visits', visit.client_id)
      return {
        ...base,
        visit_id: visitId,
        doctor_id: remoteActor,
        items: record.items,
        notes: record.notes,
        print_details: record.print_details || {},
        created_at: record.created_at,
      }
    }

    const patient = await this.patients.get(Number(record.patient_id))
    if (!patient?.client_id) throw new Error('Appointment patient has not synced')
    const patientId = await this.getRemoteId(client, 'patients', patient.client_id)
    return {
      ...base,
      patient_id: patientId,
      patient_name: record.patient_name,
      start_at: record.start_at,
      duration_minutes: record.duration_minutes,
      specialty: record.specialty,
      reason: record.reason,
      status: record.status,
      created_by: remoteActor,
      created_at: record.created_at,
    }
  }

  private async getRemoteId(client: NonNullable<typeof supabase>, table: string, clientId: string) {
    const { data, error } = await client.from(table).select('id').eq('client_id', clientId).maybeSingle()
    if (error) throw error
    if (!data?.id) throw new Error(`${table} ${clientId} has not synced yet`)
    return data.id as string
  }

  private async fetchRemoteRows(client: NonNullable<typeof supabase>, table: string) {
    const rows: Record<string, any>[] = []
    const pageSize = 1000
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await client.from(table).select('*').range(offset, offset + pageSize - 1)
      if (error) throw error
      rows.push(...(data || []))
      if (!data || data.length < pageSize) return rows
    }
  }

  private async mergeRemoteRow(table: SyncTableName, row: Record<string, any>, mapped: Record<string, any>) {
    const localTable = this.table(table)
    const existing = row.client_id ? await localTable.where('client_id').equals(row.client_id).first() : undefined
    if (existing?.sync_state === 'pending') return existing
    const next: Record<string, any> = { ...mapped, client_id: row.client_id, cloud_id: row.id, sync_state: 'synced' }
    if (existing?.id !== undefined) next.id = existing.id
    else delete next.id
    const localId = await localTable.put(next)
    return { ...next, id: localId }
  }

  private async pullRemoteRecords(client: NonNullable<typeof supabase>) {
    const remotePatients = await this.fetchRemoteRows(client, 'patients')
    for (const patient of remotePatients) await this.mergeRemoteRow('patients', patient, patient)

    const remoteVisits = await this.fetchRemoteRows(client, 'visits')
    for (const visit of remoteVisits) {
      const patient = await this.patients.where('cloud_id').equals(visit.patient_id).first()
      if (!patient?.id) continue
      await this.mergeRemoteRow('visits', visit, { ...visit, patient_id: String(patient.id) })
    }

    const remotePrescriptions = await this.fetchRemoteRows(client, 'prescriptions')
    for (const prescription of remotePrescriptions) {
      const visit = await this.visits.where('cloud_id').equals(prescription.visit_id).first()
      if (!visit?.id) continue
      await this.mergeRemoteRow('prescriptions', prescription, { ...prescription, visit_id: String(visit.id) })
    }

    const remoteAppointments = await this.fetchRemoteRows(client, 'appointments')
    for (const appointment of remoteAppointments) {
      const patient = await this.patients.where('cloud_id').equals(appointment.patient_id).first()
      if (!patient?.id) continue
      await this.mergeRemoteRow('appointments', appointment, { ...appointment, patient_id: String(patient.id) })
    }

    const remoteTickets = await this.fetchRemoteRows(client, 'serial_tickets')
    for (const ticket of remoteTickets) {
      const patient = await this.patients.where('cloud_id').equals(ticket.patient_id).first()
      if (!patient?.id) continue
      const appointment = ticket.appointment_id
        ? await this.appointments.where('cloud_id').equals(ticket.appointment_id).first()
        : undefined
      await this.mergeRemoteRow('serialTickets', ticket, {
        ...ticket,
        patient_id: String(patient.id),
        appointment_id: appointment?.id,
        date_key: String(ticket.date_key),
      })
    }
  }
}

export const db = new ClinicDB()
