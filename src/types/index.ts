// src/types/index.ts
export type Role = 'doctor' | 'assistant' | 'pharmacy'

export interface Profile {
  id: string
  full_name: string
  role: Role
  created_at?: string
}

export interface Patient {
  id?: string
  hospital_id?: string
  name: string
  date_of_birth?: string | null
  gender?: 'male' | 'female' | 'other' | null
  phone?: string | null
  address?: string | null
  created_at?: string
}

export interface Visit {
  id?: string
  patient_id: string
  clinic_id?: string
  visit_type?: 'walk-in' | 'booked'
  specialty?: string | null
  status?: 'waiting' | 'in-consult' | 'done' | 'cancelled'
  created_at?: string
}

export interface Prescription {
  id?: string
  visit_id: string
  doctor_id?: string
  items: PrescriptionItem[]
  notes?: string
  created_at?: string
}

export interface PrescriptionItem {
  drug_id?: string
  brand?: string
  generic?: string
  dose?: string
  frequency?: string
  duration?: string
  instructions?: string
}

export interface Drug {
  id?: string
  generic_name: string
  brand_name?: string
  strength?: string
  manufacturer?: string
  created_at?: string
}
