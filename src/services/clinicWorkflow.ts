import { Appointment, Patient, SerialTicket } from '../types'
import { createClientId, db } from './db'

export function localDateKey(date: Date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getNextSerialNumber(
  tickets: Pick<SerialTicket, 'tenant_id' | 'sub_tenant_id' | 'date_key' | 'serial_number'>[],
  tenantId: string,
  subTenantId: string | undefined,
  dateKey: string,
) {
  return tickets
    .filter((ticket) => ticket.tenant_id === tenantId && ticket.sub_tenant_id === subTenantId && ticket.date_key === dateKey)
    .reduce((highest, ticket) => Math.max(highest, ticket.serial_number), 0) + 1
}

export function formatSerialNumber(serialNumber: number) {
  return `S-${String(serialNumber).padStart(3, '0')}`
}

export function getWeekDates(date: Date) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday)
    day.setDate(monday.getDate() + index)
    return day
  })
}

export async function issueSerialTicket({
  patient,
  tenantId,
  subTenantId,
  createdBy,
  appointment,
  date = new Date(),
}: {
  patient: Pick<Patient, 'id' | 'name'>
  tenantId: string
  subTenantId?: string
  createdBy?: string
  appointment?: Appointment
  date?: Date
}) {
  const dateKey = localDateKey(date)

  const ticket = await db.transaction('rw', db.serialTickets, db.syncQueue, async () => {
    if (appointment?.id !== undefined) {
      const existing = await db.serialTickets.where('appointment_id').equals(appointment.id).first()
      if (existing) return existing
    }

    const dayTickets = await db.serialTickets.where('[tenant_id+date_key]').equals([tenantId, dateKey]).toArray()
    const serialNumber = getNextSerialNumber(dayTickets, tenantId, subTenantId, dateKey)
    const ticket: SerialTicket = {
      client_id: createClientId(),
      sync_state: 'pending',
      tenant_id: tenantId,
      sub_tenant_id: subTenantId,
      patient_id: String(patient.id ?? ''),
      patient_name: patient.name,
      appointment_id: appointment?.id,
      date_key: dateKey,
      serial_number: serialNumber,
      display_code: formatSerialNumber(serialNumber),
      status: 'waiting',
      created_by: createdBy,
      created_at: new Date().toISOString(),
    }
    const id = await db.serialTickets.add(ticket)
    await db.syncQueue.add({
      table: 'serialTickets',
      item: { ...ticket, id },
      op: 'create',
      created_at: new Date().toISOString(),
    })
    return { ...ticket, id }
  })
  void db.syncWithSupabase()
  return ticket
}