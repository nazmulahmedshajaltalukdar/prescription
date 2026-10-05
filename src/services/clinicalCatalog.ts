import { AuthUser } from './auth'
import { runAdminAction } from './adminManagement'
import { isSupabaseConfigured, supabase } from './supabaseClient'

export interface MedicineCatalogEntry {
  id: string
  catalog_code: string
  generic_name: string
  brand_name: string | null
  strength: string | null
  dosage_form: string | null
  manufacturer: string | null
  registration_no: string | null
  source_name: string
  source_url: string
  source_license: string
  source_revision: string
  verified_at: string
}

export interface ClinicalReferenceTerm {
  id: string
  code: string
  category: 'chief_complaint' | 'disease' | 'specialty'
  label_en: string
  label_bn: string | null
  synonyms: string[]
  classification_system: string | null
  classification_code: string | null
  source_name: string
  source_url: string
  source_license: string
  source_revision: string
  verified_at: string
}

export interface ClinicPrescriptionTemplate {
  id: string
  title: string
  medicine_catalog_id: string | null
  generic_name: string
  brand_name: string | null
  strength: string | null
  dosage_form: string | null
  dose: string | null
  frequency: string | null
  duration: string | null
  instructions: string | null
  created_by: string
  updated_at: string
}

export interface PrescriptionTemplateInput {
  title: string
  medicineCatalogId?: string
  genericName: string
  brandName?: string
  strength?: string
  dosageForm?: string
  dose?: string
  frequency?: string
  duration?: string
  instructions?: string
}

const resultCache = new Map<string, { expiresAt: number; rows: unknown[] }>()
const pageSize = 20

export function clearClinicalCatalogCache() {
  resultCache.clear()
}

function normalizeQuery(value: string) {
  return value.trim().replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ')
}

function getCachedPage<T>(key: string) {
  const cached = resultCache.get(key)
  if (!cached || cached.expiresAt < Date.now()) {
    resultCache.delete(key)
    return null
  }
  return cached.rows as T[]
}

function cachePage(key: string, rows: unknown[]) {
  resultCache.set(key, { expiresAt: Date.now() + 6 * 60 * 60 * 1000, rows })
  if (resultCache.size > 80) {
    const oldest = resultCache.keys().next().value
    if (oldest) resultCache.delete(oldest)
  }
}

async function searchCatalogTable<T>(table: string, query: string, offset: number, filter?: string): Promise<{ rows: T[]; hasMore: boolean }> {
  const normalized = normalizeQuery(query)
  if (normalized.length < 2) return { rows: [], hasMore: false }
  if (!isSupabaseConfigured() || !supabase) throw new Error('The shared clinical catalog requires a configured Supabase project.')
  const key = `${table}:${filter || ''}:${normalized.toLocaleLowerCase()}:${offset}`
  const cached = getCachedPage<T>(key)
  if (cached) return { rows: cached, hasMore: cached.length === pageSize }

  const columns = filter
    ? 'id,code,category,label_en,label_bn,synonyms,classification_system,classification_code,source_name,source_url,source_license,source_revision,verified_at'
    : 'id,catalog_code,generic_name,brand_name,strength,dosage_form,manufacturer,registration_no,source_name,source_url,source_license,source_revision,verified_at'
  let request = supabase.from(table).select(columns).eq('is_active', true)
  if (filter) request = request.eq('category', filter)
  const { data, error } = await request
    .textSearch('search_vector', normalized, { type: 'websearch', config: 'simple' })
    .order(filter ? 'label_en' : 'generic_name', { ascending: true })
    .range(offset, offset + pageSize - 1)
  if (error) throw error
  const rows = (data || []) as T[]
  cachePage(key, rows)
  return { rows, hasMore: rows.length === pageSize }
}

export function searchMedicines(query: string, offset = 0) {
  return searchCatalogTable<MedicineCatalogEntry>('medicine_catalog', query, offset)
}

export function searchClinicalTerms(query: string, category: ClinicalReferenceTerm['category'], offset = 0) {
  return searchCatalogTable<ClinicalReferenceTerm>('clinical_reference_terms', query, offset, category)
}

export async function listClinicPrescriptionTemplates(user: AuthUser): Promise<ClinicPrescriptionTemplate[]> {
  if (!isSupabaseConfigured() || !supabase) return []
  const { data, error } = await supabase
    .from('clinic_prescription_templates')
    .select('*')
    .eq('tenant_id', user.tenant_id)
    .eq('sub_tenant_id', user.sub_tenant_id || '')
    .order('title', { ascending: true })
    .limit(100)
  if (error) throw error
  return (data || []) as ClinicPrescriptionTemplate[]
}

export async function saveClinicPrescriptionTemplate(user: AuthUser, input: PrescriptionTemplateInput) {
  if (!input.title.trim() || !input.genericName.trim()) throw new Error('A template title and generic medicine name are required.')
  if (input.title.trim().length > 120) throw new Error('Template title must be 120 characters or fewer.')
  if (!isSupabaseConfigured() || !supabase) throw new Error('Saved prescription templates require a configured Supabase project.')
  const { data, error } = await supabase
    .from('clinic_prescription_templates')
    .insert({
      tenant_id: user.tenant_id,
      sub_tenant_id: user.sub_tenant_id || '',
      title: input.title.trim(),
      medicine_catalog_id: input.medicineCatalogId || null,
      generic_name: input.genericName.trim(),
      brand_name: input.brandName?.trim() || null,
      strength: input.strength?.trim() || null,
      dosage_form: input.dosageForm?.trim() || null,
      dose: input.dose?.trim() || null,
      frequency: input.frequency?.trim() || null,
      duration: input.duration?.trim() || null,
      instructions: input.instructions?.trim() || null,
      created_by: user.id,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as ClinicPrescriptionTemplate
}

export async function deleteClinicPrescriptionTemplate(user: AuthUser, id: string) {
  if (!isSupabaseConfigured() || !supabase) throw new Error('Saved prescription templates require a configured Supabase project.')
  const { error } = await supabase
    .from('clinic_prescription_templates')
    .delete()
    .eq('id', id)
    .eq('tenant_id', user.tenant_id)
    .eq('sub_tenant_id', user.sub_tenant_id || '')
  if (error) throw error
}

export interface CatalogImportMetadata {
  sourceName: string
  sourceUrl: string
  sourceLicense: string
  sourceRevision: string
  verifiedAt: string
}

export async function importCatalogRows(
  type: 'medicine' | 'term',
  records: Array<Record<string, unknown>>,
  metadata: CatalogImportMetadata,
) {
  if (!records.length) throw new Error('The CSV contains no data rows.')
  if (!metadata.sourceName.trim() || !metadata.sourceLicense.trim() || !metadata.sourceRevision.trim()) {
    throw new Error('Source name, license/permission, and revision are required.')
  }
  let sourceUrl: URL
  try {
    sourceUrl = new URL(metadata.sourceUrl)
  } catch {
    throw new Error('Enter a valid HTTPS source URL.')
  }
  if (sourceUrl.protocol !== 'https:') throw new Error('Source URL must use HTTPS.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(metadata.verifiedAt) || Number.isNaN(Date.parse(`${metadata.verifiedAt}T00:00:00Z`))) {
    throw new Error('Verification date must use YYYY-MM-DD.')
  }
  const codeField = type === 'medicine' ? 'catalog_code' : 'code'
  const requiredFields = type === 'medicine' ? ['catalog_code', 'generic_name'] : ['code', 'category', 'label_en']
  const codes = new Set<string>()
  records.forEach((record, index) => {
    for (const field of requiredFields) {
      if (typeof record[field] !== 'string' || !record[field].trim()) {
        throw new Error(`CSV row ${index + 2} needs a value for ${field}.`)
      }
    }
    if (type === 'term' && !['chief_complaint', 'disease'].includes(String(record.category))) {
      throw new Error(`CSV row ${index + 2} category must be chief_complaint or disease.`)
    }
    const code = String(record[codeField]).trim()
    if (codes.has(code)) throw new Error(`CSV contains duplicate ${codeField}: ${code}.`)
    codes.add(code)
  })
  const action = type === 'medicine' ? 'import_medicine_catalog' : 'import_clinical_terms'
  let imported = 0
  for (let offset = 0; offset < records.length; offset += 250) {
    try {
      const result = await runAdminAction<{ imported: number }>({
        action,
        source_name: metadata.sourceName,
        source_url: metadata.sourceUrl,
        source_license: metadata.sourceLicense,
        source_revision: metadata.sourceRevision,
        verified_at: metadata.verifiedAt,
        records: records.slice(offset, offset + 250),
      })
      imported += result.imported
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown import failure.'
      if (imported) clearClinicalCatalogCache()
      throw new Error(imported ? `${imported} rows imported before a later batch failed: ${reason}` : reason)
    }
  }
  clearClinicalCatalogCache()
  return imported
}
