import { BillingInvoice, InvoicePayment, LabOrder, LabOrderStatus, PaymentMethod } from '../types'
import { getStorage } from './storage'
import { isSupabaseConfigured, supabase } from './supabaseClient'

export interface OperationsContext {
  tenantId: string
  subTenantId: string
  userId: string
}

export interface InvoiceLine {
  description: string
  quantity: number
  unit_price: number
}

export interface CreateInvoiceInput {
  clientId: string
  invoiceNo: string
  patientId: string
  visitId?: string | null
  description: string
  items: InvoiceLine[]
  discount: number
  currency?: string
}

export interface CreateLabOrderInput {
  clientId: string
  patientId: string
  visitId?: string | null
  testName: string
  notes?: string
}

const demoPrefix = 'clinic:operations'

export function calculateInvoiceTotals(items: InvoiceLine[], discount: number) {
  if (!items.length) throw new Error('Add at least one invoice line.')
  if (items.some((item) => !item.description.trim() || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || !Number.isFinite(item.unit_price) || item.unit_price < 0)) {
    throw new Error('Invoice lines need a description, positive whole-number quantity, and a non-negative price.')
  }
  if (!Number.isFinite(discount) || discount < 0) throw new Error('Discount must be zero or greater.')
  const subtotal = Math.round(items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0) * 100) / 100
  const roundedDiscount = Math.round(discount * 100) / 100
  if (roundedDiscount > subtotal) throw new Error('Discount cannot exceed the invoice subtotal.')
  return { subtotal, discount: roundedDiscount, total: Math.round((subtotal - roundedDiscount) * 100) / 100 }
}

function scopedKey(context: OperationsContext, collection: string) {
  return `${demoPrefix}:${collection}:${encodeURIComponent(context.tenantId)}:${encodeURIComponent(context.subTenantId)}`
}

function getLocal<T>(key: string): T[] {
  const raw = getStorage()?.getItem(key)
  if (!raw) return []
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) throw new Error('Stored records are not a list.')
    return value as T[]
  } catch (error) {
    throw new Error(`Local demo records could not be read: ${error instanceof Error ? error.message : 'Invalid data'}`)
  }
}

function saveLocal<T>(key: string, value: T[]) {
  const storage = getStorage()
  if (storage) storage.setItem(key, JSON.stringify(value))
  else throw new Error('Local browser storage is unavailable.')
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function requireOperationsContext(context: OperationsContext) {
  if (!context?.tenantId || !context.subTenantId || !context.userId) {
    throw new Error('A signed-in clinic location is required for this operation.')
  }
}

export async function getInvoices(context: OperationsContext): Promise<BillingInvoice[]> {
  requireOperationsContext(context)
  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase
      .from('billing_invoices')
      .select('*')
      .eq('tenant_id', context.tenantId)
      .eq('sub_tenant_id', context.subTenantId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []) as BillingInvoice[]
  }
  return getLocal<BillingInvoice>(scopedKey(context, 'invoices')).sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export async function createInvoice(context: OperationsContext, input: CreateInvoiceInput): Promise<BillingInvoice> {
  requireOperationsContext(context)
  const totals = calculateInvoiceTotals(input.items, input.discount)
  if (!input.clientId || !input.invoiceNo.trim() || !input.patientId || !input.description.trim()) {
    throw new Error('Invoice number, patient, and description are required.')
  }
  if (input.currency && input.currency !== 'BDT') throw new Error('Clinic invoices currently support BDT only.')
  const invoice = {
    client_id: input.clientId,
    tenant_id: context.tenantId,
    sub_tenant_id: context.subTenantId,
    invoice_no: input.invoiceNo.trim(),
    patient_id: input.patientId,
    visit_id: input.visitId || null,
    description: input.description.trim(),
    items: input.items.map((item) => ({ ...item, description: item.description.trim() })),
    ...totals,
    paid_amount: 0,
    currency: 'BDT',
    status: 'unpaid' as const,
    created_by: context.userId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (isSupabaseConfigured() && supabase) {
    const { data: existing, error: existingError } = await supabase
      .from('billing_invoices')
      .select('*')
      .eq('tenant_id', context.tenantId)
      .eq('sub_tenant_id', context.subTenantId)
      .eq('client_id', input.clientId)
      .maybeSingle()
    if (existingError) throw existingError
    if (existing) return existing as BillingInvoice

    const { data, error } = await supabase
      .from('billing_invoices')
      .insert(invoice)
      .select('*')
      .single()
    if (error?.code === '23505') {
      const { data: duplicate, error: duplicateError } = await supabase
        .from('billing_invoices')
        .select('*')
        .eq('tenant_id', context.tenantId)
        .eq('sub_tenant_id', context.subTenantId)
        .eq('client_id', input.clientId)
        .maybeSingle()
      if (duplicateError) throw duplicateError
      if (duplicate) return duplicate as BillingInvoice
    }
    if (error) throw error
    return data as BillingInvoice
  }

  const key = scopedKey(context, 'invoices')
  const invoices = getLocal<BillingInvoice>(key)
  const existing = invoices.find((item) => item.client_id === input.clientId)
  if (existing) return existing
  const created = { ...invoice, id: input.clientId }
  saveLocal(key, [created, ...invoices])
  return created
}

export async function recordInvoicePayment(
  context: OperationsContext,
  invoiceId: string,
  amount: number,
  method: PaymentMethod,
  clientId: string,
  reference?: string,
): Promise<BillingInvoice> {
  requireOperationsContext(context)
  const roundedAmount = Math.round(amount * 100) / 100
  if (!Number.isFinite(roundedAmount) || roundedAmount <= 0 || !clientId) {
    throw new Error('Enter a positive payment amount.')
  }
  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase.rpc('record_invoice_payment', {
      p_invoice_id: invoiceId,
      p_amount: roundedAmount,
      p_method: method,
      p_reference: reference || null,
      p_client_id: clientId,
    }).single()
    if (error) throw error
    return data as BillingInvoice
  }

  const invoicesKey = scopedKey(context, 'invoices')
  const paymentsKey = scopedKey(context, 'payments')
  const invoices = getLocal<BillingInvoice>(invoicesKey)
  const existingPayment = getLocal<InvoicePayment & { client_id: string }>(paymentsKey)
    .find((payment) => payment.client_id === clientId)
  const invoice = invoices.find((item) => item.id === invoiceId)
  if (!invoice) throw new Error('Invoice was not found.')
  if (existingPayment) {
    if (existingPayment.invoice_id !== invoiceId || existingPayment.amount !== roundedAmount || existingPayment.method !== method) {
      throw new Error('Payment request ID was already used for a different payment.')
    }
    return invoice
  }
  if (invoice.status === 'cancelled') throw new Error('Cannot record payment against a cancelled invoice.')
  if (invoice.paid_amount + roundedAmount > invoice.total) throw new Error('Payment exceeds the invoice balance.')
  const updated: BillingInvoice = {
    ...invoice,
    paid_amount: Math.round((invoice.paid_amount + roundedAmount) * 100) / 100,
    status: invoice.paid_amount + roundedAmount === invoice.total ? 'paid' : 'partially_paid',
  }
  saveLocal(invoicesKey, invoices.map((item) => item.id === invoiceId ? updated : item))
  saveLocal(paymentsKey, [{
    id: makeId(),
    client_id: clientId,
    invoice_id: invoiceId,
    amount: roundedAmount,
    method,
    reference,
    created_at: new Date().toISOString(),
  }, ...getLocal<InvoicePayment & { client_id: string }>(paymentsKey)])
  return updated
}

export async function getLabOrders(context: OperationsContext): Promise<LabOrder[]> {
  requireOperationsContext(context)
  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase
      .from('lab_orders')
      .select('id, client_id, tenant_id, sub_tenant_id, patient_id, visit_id, test_name, tests, result_text, notes, status, ordered_by, updated_by, created_at, updated_at')
      .eq('tenant_id', context.tenantId)
      .eq('sub_tenant_id', context.subTenantId)
      .not('patient_id', 'is', null)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []).map((row) => ({
      ...row,
      test_name: row.test_name || (Array.isArray(row.tests) ? String(row.tests[0] || '') : 'Legacy lab order'),
      status: row.status as LabOrderStatus,
    })) as LabOrder[]
  }
  return getLocal<LabOrder>(scopedKey(context, 'lab-orders')).sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export async function createLabOrder(context: OperationsContext, input: CreateLabOrderInput): Promise<LabOrder> {
  requireOperationsContext(context)
  if (!input.clientId || !input.patientId || !input.testName.trim() || input.testName.trim().length > 160) {
    throw new Error('Select a patient and enter a lab test name of 160 characters or fewer.')
  }
  if ((input.notes?.length || 0) > 1000) throw new Error('Lab notes must be 1000 characters or fewer.')
  const order = {
    client_id: input.clientId,
    tenant_id: context.tenantId,
    sub_tenant_id: context.subTenantId,
    patient_id: input.patientId,
    visit_id: input.visitId || null,
    test_name: input.testName.trim(),
    tests: [input.testName.trim()],
    notes: input.notes?.trim() || null,
    result_text: null,
    status: 'requested' as const,
    ordered_by: context.userId,
    updated_by: context.userId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  if (isSupabaseConfigured() && supabase) {
    const { data: existing, error: existingError } = await supabase
      .from('lab_orders')
      .select('*')
      .eq('tenant_id', context.tenantId)
      .eq('sub_tenant_id', context.subTenantId)
      .eq('client_id', input.clientId)
      .maybeSingle()
    if (existingError) throw existingError
    if (existing) return { ...existing, test_name: existing.test_name || order.test_name } as LabOrder

    const { data, error } = await supabase.from('lab_orders').insert(order).select('*').single()
    if (error?.code === '23505') {
      const { data: duplicate, error: duplicateError } = await supabase
        .from('lab_orders')
        .select('*')
        .eq('tenant_id', context.tenantId)
        .eq('sub_tenant_id', context.subTenantId)
        .eq('client_id', input.clientId)
        .maybeSingle()
      if (duplicateError) throw duplicateError
      if (duplicate) return { ...duplicate, test_name: duplicate.test_name || order.test_name } as LabOrder
    }
    if (error) throw error
    return { ...data, test_name: data.test_name || order.test_name } as LabOrder
  }
  const key = scopedKey(context, 'lab-orders')
  const orders = getLocal<LabOrder>(key)
  const existing = orders.find((item) => item.client_id === input.clientId)
  if (existing) return existing
  const created: LabOrder = { ...order, id: input.clientId }
  saveLocal(key, [created, ...orders])
  return created
}

export async function updateLabOrder(
  context: OperationsContext,
  orderId: string,
  changes: { status?: LabOrderStatus; result_text?: string },
): Promise<LabOrder> {
  requireOperationsContext(context)
  if (changes.status && !(['requested', 'processing', 'completed', 'cancelled'] as LabOrderStatus[]).includes(changes.status)) {
    throw new Error('Choose a valid lab order status.')
  }
  if (changes.result_text && changes.result_text.length > 5000) throw new Error('Lab result must be 5000 characters or fewer.')
  if (changes.status === 'completed' && !changes.result_text?.trim()) {
    throw new Error('Enter the lab result before marking an order complete.')
  }
  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase
      .from('lab_orders')
      .update({ ...changes, updated_by: context.userId, updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .eq('tenant_id', context.tenantId)
      .eq('sub_tenant_id', context.subTenantId)
      .select('*')
      .single()
    if (error) throw error
    return { ...data, test_name: data.test_name || 'Legacy lab order' } as LabOrder
  }
  const key = scopedKey(context, 'lab-orders')
  const orders = getLocal<LabOrder>(key)
  const current = orders.find((order) => order.id === orderId)
  if (!current) throw new Error('Lab order was not found.')
  const updated = { ...current, ...changes, updated_by: context.userId, updated_at: new Date().toISOString() }
  saveLocal(key, orders.map((order) => order.id === orderId ? updated : order))
  return updated
}
