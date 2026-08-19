// src/services/db.ts
import Dexie, { Table } from 'dexie'
import { Patient, Visit, Prescription, Drug } from '../types'
import { supabase } from './supabaseClient'

export class ClinicDB extends Dexie {
  patients!: Table<Patient, string>
  visits!: Table<Visit, string>
  prescriptions!: Table<Prescription, string>
  drugs!: Table<Drug, string>
  syncQueue!: Table<any, number>

  constructor() {
    super('ClinicDB')
    this.version(1).stores({
      patients: '++id, hospital_id, name, phone, created_at',
      visits: '++id, patient_id, specialty, status, created_at',
      prescriptions: '++id, visit_id, doctor_id, created_at',
      drugs: '++id, generic_name, brand_name, strength',
      syncQueue: '++id, table, item, op, created_at',
    })

    this.on('ready', () => {
      // attempt initial sync when ready and online
      if (navigator.onLine) {
        this.syncWithSupabase().catch((e) => console.error('initial sync failed', e))
      }

      window.addEventListener('online', () => this.syncWithSupabase())
    })
  }

  async pushToQueue(table: string, item: any, op: 'create' | 'update' | 'delete') {
    await this.syncQueue.add({ table, item, op, created_at: new Date().toISOString() })
  }

  async syncWithSupabase() {
    // Very small, safe sync loop skeleton. For production, implement batching, conflict resolution and reliable retries.
    const queued = await this.syncQueue.toArray()
    for (const q of queued) {
      try {
        const { table, item, op } = q
        if (table === 'patients') {
          if (op === 'create') {
            const { data, error } = await supabase.from('patients').insert(item)
            if (error) throw error
          } else if (op === 'update') {
            const { id, ...rest } = item
            const { data, error } = await supabase.from('patients').update(rest).eq('id', id)
            if (error) throw error
          }
        }
        // TODO: handle other tables similarly (visits, prescriptions, inventory)
        await this.syncQueue.delete(q.id)
      } catch (err) {
        console.error('sync item failed', err)
        // leave in queue for retry
      }
    }
  }
}

export const db = new ClinicDB()
