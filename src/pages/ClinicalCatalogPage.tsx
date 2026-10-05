import React, { ChangeEvent, FormEvent, useMemo, useState } from 'react'
import { BookOpen, Database, Search, Upload } from 'lucide-react'
import {
  ClinicalReferenceTerm,
  CatalogImportMetadata,
  MedicineCatalogEntry,
  importCatalogRows,
  searchClinicalTerms,
  searchMedicines,
} from '../services/clinicalCatalog'
import { useAuth } from '../services/auth'
import { parseCatalogCsv } from '../services/catalogCsv'

type CatalogTab = 'medicines' | 'complaints' | 'diseases'

const emptyMetadata: CatalogImportMetadata = {
  sourceName: '',
  sourceUrl: '',
  sourceLicense: '',
  sourceRevision: '',
  verifiedAt: (() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })(),
}

export default function ClinicalCatalogPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<CatalogTab>('medicines')
  const [query, setQuery] = useState('')
  const [medicines, setMedicines] = useState<MedicineCatalogEntry[]>([])
  const [terms, setTerms] = useState<ClinicalReferenceTerm[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [metadata, setMetadata] = useState(emptyMetadata)
  const [fileRecords, setFileRecords] = useState<Record<string, unknown>[]>([])
  const [fileName, setFileName] = useState('')
  const [fileType, setFileType] = useState<CatalogTab | null>(null)
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isPlatformOwner = user?.role === 'platform_owner'

  const tabLabel = useMemo(() => ({
    medicines: 'Medicines',
    complaints: 'Chief complaints',
    diseases: 'Diseases',
  }[tab]), [tab])

  const runSearch = async (offset = 0) => {
    const search = query.trim()
    if (search.length < 2) {
      setMedicines([])
      setTerms([])
      setHasMore(false)
      setSearchError(null)
      return
    }
    setLoading(true)
    setSearchError(null)
    try {
      const result = tab === 'medicines'
        ? await searchMedicines(search, offset)
        : await searchClinicalTerms(search, tab === 'complaints' ? 'chief_complaint' : 'disease', offset)
      if (tab === 'medicines') setMedicines((current) => offset ? [...current, ...result.rows as MedicineCatalogEntry[]] : result.rows as MedicineCatalogEntry[])
      else setTerms((current) => offset ? [...current, ...result.rows as ClinicalReferenceTerm[]] : result.rows as ClinicalReferenceTerm[])
      setHasMore(result.hasMore)
    } catch (searchError) {
      setSearchError(searchError instanceof Error ? searchError.message : 'Unable to search the clinical catalog.')
    } finally {
      setLoading(false)
    }
  }

  const changeTab = (next: CatalogTab) => {
    setTab(next)
    if (next !== tab) {
      setFileRecords([])
      setFileName('')
      setFileType(null)
    }
    setMedicines([])
    setTerms([])
    setHasMore(false)
    setSearchError(null)
  }

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    setFileRecords([])
    setFileName('')
    setFileType(null)
    setError(null)
    setMessage(null)
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setError('CSV file must be 5 MB or smaller.')
      return
    }
    try {
      const records = parseCatalogCsv(await file.text())
      setFileRecords(records)
      setFileName(file.name)
      setFileType(tab)
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : 'Unable to read CSV.')
    }
  }

  const importData = async (event: FormEvent) => {
    event.preventDefault()
    setImporting(true)
    setError(null)
    setMessage(null)
    try {
      if (!user || !isPlatformOwner) throw new Error('Platform owner access is required to import shared catalog data.')
      if (!fileType || fileType !== tab) throw new Error('Choose a CSV file for the selected catalog tab.')
      const type = fileType === 'medicines' ? 'medicine' : 'term'
      const count = await importCatalogRows(type, fileRecords, metadata)
      setMessage(`Imported or updated ${count} ${type === 'medicine' ? 'medicine' : 'clinical term'} rows from ${fileName}.`)
      setFileRecords([])
      setFileName('')
      setFileType(null)
      setQuery('')
      setMedicines([])
      setTerms([])
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Catalog import failed.')
    } finally {
      setImporting(false)
    }
  }

  const rows = tab === 'medicines' ? medicines : terms

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reference library</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">Clinical catalog</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">Search loads small result pages only when requested. Product entries are reference data—not treatment or dosage recommendations.</p>
      </header>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Clinical catalog">
        {([
          ['medicines', 'Medicines'],
          ['complaints', 'Chief complaints'],
          ['diseases', 'Diseases'],
        ] as Array<[CatalogTab, string]>).map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => changeTab(value)} className={`min-h-11 shrink-0 rounded-xl px-4 text-sm font-medium ${tab === value ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}>{label}</button>
        ))}
      </div>

      <section className="soft-card overflow-hidden">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="field-input pl-10" value={query} onChange={(event) => { setQuery(event.target.value); setMedicines([]); setTerms([]); setHasMore(false) }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void runSearch() } }} placeholder={`Search ${tabLabel.toLowerCase()} (type at least 2 characters)`} />
          </label>
          <button type="button" onClick={() => void runSearch()} disabled={loading || query.trim().length < 2} className="action-button-primary mt-3 min-h-10 disabled:opacity-50">{loading ? 'Searching…' : 'Search'}</button>
          {searchError && <p role="alert" className="mt-3 text-sm text-rose-700">{searchError}</p>}
        </div>
        <div className="divide-y divide-slate-100">
          {rows.length ? rows.map((row) => tab === 'medicines' ? (
            <article key={(row as MedicineCatalogEntry).id} className="p-4">
              <p className="font-semibold text-slate-900">{(row as MedicineCatalogEntry).brand_name || (row as MedicineCatalogEntry).generic_name}{(row as MedicineCatalogEntry).strength ? ` · ${(row as MedicineCatalogEntry).strength}` : ''}</p>
              <p className="mt-1 text-sm text-slate-600">{(row as MedicineCatalogEntry).generic_name}{(row as MedicineCatalogEntry).dosage_form ? ` · ${(row as MedicineCatalogEntry).dosage_form}` : ''}{(row as MedicineCatalogEntry).manufacturer ? ` · ${(row as MedicineCatalogEntry).manufacturer}` : ''}</p>
              <p className="mt-2 text-xs text-slate-500">Source: {(row as MedicineCatalogEntry).source_name} · {(row as MedicineCatalogEntry).source_revision} · Verified {(row as MedicineCatalogEntry).verified_at} · License: {(row as MedicineCatalogEntry).source_license}</p>
            </article>
          ) : (
            <article key={(row as ClinicalReferenceTerm).id} className="p-4">
              <p className="font-semibold text-slate-900">{(row as ClinicalReferenceTerm).label_en}{(row as ClinicalReferenceTerm).label_bn ? ` · ${(row as ClinicalReferenceTerm).label_bn}` : ''}</p>
              <p className="mt-1 text-sm text-slate-600">{(row as ClinicalReferenceTerm).category.replace('_', ' ')}{(row as ClinicalReferenceTerm).classification_code ? ` · ${(row as ClinicalReferenceTerm).classification_system}: ${(row as ClinicalReferenceTerm).classification_code}` : ''}</p>
              <p className="mt-2 text-xs text-slate-500">Source: {(row as ClinicalReferenceTerm).source_name} · {(row as ClinicalReferenceTerm).source_revision} · Verified {(row as ClinicalReferenceTerm).verified_at}</p>
            </article>
          )) : <div className="p-8 text-center"><BookOpen className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-medium text-slate-800">{query.trim().length >= 2 ? 'No matching entries' : 'Search the reference library'}</p><p className="mt-1 text-sm text-slate-500">{query.trim().length >= 2 ? 'No verified entries matched. You can still enter a medicine manually.' : 'Nothing is downloaded until you search.'}</p></div>}
        </div>
        {hasMore && <div className="border-t border-slate-100 p-4 text-center"><button type="button" disabled={loading} onClick={() => void runSearch(rows.length)} className="action-button-secondary min-h-10">{loading ? 'Loading…' : 'Load more results'}</button></div>}
      </section>

      {isPlatformOwner && (
        <details className="soft-card group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 p-4 font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
            <Database className="h-5 w-5 text-sky-700" /> Platform-owner bulk import <span className="ml-auto text-xs font-normal text-slate-500 group-open:hidden">Expand</span>
          </summary>
          <form onSubmit={importData} className="space-y-4 border-t border-slate-100 p-4 sm:p-5">
            <p className="text-sm text-slate-600">Import only data you are authorized to reuse. Source, license/permission, revision and verification date are stored on every record. CSV rows are sent in small batches; catalog search never downloads the full dataset.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label><span className="field-label">Source name</span><input required className="field-input" value={metadata.sourceName} onChange={(event) => setMetadata({ ...metadata, sourceName: event.target.value })} /></label>
              <label><span className="field-label">Source URL (HTTPS)</span><input required type="url" className="field-input" value={metadata.sourceUrl} onChange={(event) => setMetadata({ ...metadata, sourceUrl: event.target.value })} /></label>
              <label><span className="field-label">License / written permission</span><input required className="field-input" value={metadata.sourceLicense} onChange={(event) => setMetadata({ ...metadata, sourceLicense: event.target.value })} /></label>
              <label><span className="field-label">Dataset revision/version</span><input required className="field-input" value={metadata.sourceRevision} onChange={(event) => setMetadata({ ...metadata, sourceRevision: event.target.value })} /></label>
              <label><span className="field-label">Verified on</span><input required type="date" className="field-input" value={metadata.verifiedAt} onChange={(event) => setMetadata({ ...metadata, verifiedAt: event.target.value })} /></label>
              <label><span className="field-label">CSV file · max 5 MB</span><input key={tab} required type="file" accept=".csv,text/csv" onChange={(event) => { void onFileChange(event) }} className="block min-h-11 w-full text-sm text-slate-600 file:mr-3 file:min-h-10 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:text-sm file:font-medium" /></label>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
              <p className="font-semibold text-slate-800">{tab === 'medicines' ? 'Medicine CSV headers' : 'Clinical-term CSV headers'}</p>
              <code className="mt-1 block break-all">{tab === 'medicines' ? 'catalog_code,generic_name,brand_name,strength,dosage_form,manufacturer,registration_no,search_terms' : 'code,category,label_en,label_bn,synonyms,classification_system,classification_code'}</code>
              <p className="mt-1">Use | between search terms/synonyms. For clinical terms, category must be chief_complaint or disease.</p>
            </div>
            {fileName && <p className="text-sm text-slate-700">{fileName} · {fileRecords.length} rows ready</p>}
            {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
            {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
            <button disabled={importing || !fileRecords.length} type="submit" className="action-button-primary min-h-11 disabled:opacity-50"><Upload className="mr-2 h-4 w-4" />{importing ? 'Importing…' : 'Import this catalog'}</button>
          </form>
        </details>
      )}
    </div>
  )
}
