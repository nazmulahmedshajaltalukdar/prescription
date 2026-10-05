// src/types/index.ts
export type Role = 'doctor' | 'assistant' | 'pharmacy'

export interface Profile {
  id: string
  full_name: string
  role: Role
  created_at?: string
}

export interface Patient {
  id?: string | number
  client_id?: string
  cloud_id?: string
  sync_state?: 'pending' | 'synced'
  hospital_id?: string
  tenant_id?: string
  sub_tenant_id?: string
  created_by?: string
  name: string
  date_of_birth?: string | null
  gender?: 'male' | 'female' | 'other' | null
  phone?: string | null
  address?: string | null
  created_at?: string
}

export interface Visit {
  id?: string | number
  client_id?: string
  cloud_id?: string
  sync_state?: 'pending' | 'synced'
  patient_id: string
  tenant_id?: string
  sub_tenant_id?: string
  clinic_id?: string
  visit_type?: 'walk-in' | 'booked'
  specialty?: string | null
  status?: 'waiting' | 'in-consult' | 'done' | 'cancelled'
  created_at?: string
}

export type AppointmentStatus = 'scheduled' | 'checked_in' | 'in_consult' | 'completed' | 'cancelled'

export interface Appointment {
  id?: number
  client_id?: string
  cloud_id?: string
  sync_state?: 'pending' | 'synced'
  tenant_id?: string
  sub_tenant_id?: string
  patient_id: string
  patient_name: string
  start_at: string
  duration_minutes: number
  specialty: string
  reason?: string
  status: AppointmentStatus
  created_by?: string
  created_at: string
}

export type SerialStatus = 'waiting' | 'in_consult' | 'completed' | 'cancelled'

export interface SerialTicket {
  id?: number
  client_id?: string
  cloud_id?: string
  sync_state?: 'pending' | 'synced'
  tenant_id?: string
  sub_tenant_id?: string
  patient_id: string
  patient_name: string
  appointment_id?: number
  date_key: string
  serial_number: number
  display_code: string
  status: SerialStatus
  created_by?: string
  created_at: string
}

export interface Prescription {
  id?: string | number
  client_id?: string
  cloud_id?: string
  sync_state?: 'pending' | 'synced'
  visit_id: string
  tenant_id?: string
  sub_tenant_id?: string
  doctor_id?: string
  items: PrescriptionItem[]
  notes?: string
  print_details?: PrescriptionPrintDetails
  created_at?: string
}

export interface PrescriptionPrintDetails {
  clinic_name?: string
  clinic_reg_no?: string
  clinic_address?: string
  clinic_phone?: string
  clinic_preset?: string
  department?: string
  patient_name?: string
  patient_phone?: string
  patient_id_no?: string
  age?: string
  gender?: string
  prescription_no?: string
  follow_up_date?: string
  warnings?: string
  pharmacist_name?: string
  stamp_text?: string
  is_emergency?: boolean
  doctor_name?: string
  doctor_reg_no?: string
  doctor_qualifications?: string
  signature_data_url?: string
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

export interface InventoryItem {
  id?: string
  drug_id?: string
  pharmacy_id?: string
  clinic_id?: string
  name: string
  sku?: string
  batch?: string
  quantity: number
  low_stock_threshold?: number
  tenant_id?: string
  sub_tenant_id?: string
  updated_by?: string
  unit?: string
  location?: string
  supplier?: string
  last_updated?: string
}

export interface InventoryAdapter {
  getItems: () => Promise<InventoryItem[]>
  getLowStockItems: () => Promise<InventoryItem[]>
  createItem: (item: Omit<InventoryItem, 'id'>) => Promise<InventoryItem>
  adjustStock: (itemId: string, delta: number) => Promise<InventoryItem>
}

export interface PharmacyPrescriptionLink {
  id?: string
  prescription_id: string
  tenant_id?: string
  sub_tenant_id?: string
  doctor_id?: string
  clinic_id?: string
  pharmacy_id?: string
  items?: Array<{ inventory_id: string; name?: string; quantity: number; unit?: string }>
  status?: 'pending' | 'dispensed' | 'cancelled'
  created_at?: string
}

export interface DispenseRequest {
  idempotency_key?: string
  prescription_id: string
  doctor_id?: string
  pharmacy_id?: string
  clinic_id?: string
  items: Array<{
    inventory_id?: string
    name: string
    quantity: number
    unit?: string
  }>
  created_at?: string
}

export type InvoiceStatus = 'unpaid' | 'partially_paid' | 'paid' | 'cancelled'
export type PaymentMethod = 'cash' | 'card' | 'mobile_money' | 'bank_transfer' | 'other'

export interface BillingInvoice {
  id: string
  client_id?: string
  tenant_id: string
  sub_tenant_id: string
  invoice_no: string
  patient_id: string
  visit_id?: string | null
  patient_name?: string
  description: string
  items: Array<{ description: string; quantity: number; unit_price: number }>
  subtotal: number
  discount: number
  total: number
  paid_amount: number
  currency: string
  status: InvoiceStatus
  created_by?: string
  created_at: string
}

export interface InvoicePayment {
  id?: string
  invoice_id: string
  amount: number
  method: PaymentMethod
  reference?: string
  created_at?: string
}

export type LabOrderStatus = 'requested' | 'processing' | 'completed' | 'cancelled'

export interface LabOrder {
  id: string
  client_id?: string
  tenant_id: string
  sub_tenant_id: string
  patient_id: string
  visit_id?: string | null
  patient_name?: string
  test_name: string
  notes?: string | null
  result_text?: string | null
  status: LabOrderStatus
  ordered_by?: string
  updated_by?: string
  created_at: string
  updated_at?: string
}
