import { Appointment, Patient } from '../types'

export interface ExternalClinicAdapter {
  readonly provider: string
  syncPatient(patient: Patient): Promise<void>
  syncAppointment(appointment: Appointment): Promise<void>
  syncSerial(appointmentId: number, serialNumber: number): Promise<void>
}

export function getExternalClinicStatus(adapter?: ExternalClinicAdapter) {
  return adapter
    ? { configured: true, provider: adapter.provider, message: 'External sync is configured.' }
    : { configured: false, provider: null, message: 'External system is not configured. Internal clinic workflows remain available.' }
}