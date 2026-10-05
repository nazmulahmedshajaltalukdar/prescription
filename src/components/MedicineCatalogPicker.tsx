import React, { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { MedicineCatalogEntry, searchMedicines } from '../services/clinicalCatalog'

export default function MedicineCatalogPicker({
  onSelect,
}: {
  onSelect: (medicine: MedicineCatalogEntry) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MedicineCatalogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const search = query.trim()
    if (search.length < 2) {
      setResults([])
      setError(null)
      return
    }
    let active = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      searchMedicines(search)
        .then(({ rows }) => { if (active) setResults(rows) })
        .catch((searchError) => { if (active) setError(searchError instanceof Error ? searchError.message : 'Unable to search the medicine catalog.') })
        .finally(() => { if (active) setLoading(false) })
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [query])

  return (
    <div className="relative">
      <label className="relative block">
        <span className="field-label">Search shared medicine catalog</span>
        <Search className="absolute left-3 top-[2.55rem] h-4 w-4 text-slate-400" />
        <input className="field-input pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search generic, brand, or strength" autoComplete="off" />
      </label>
      {query.trim().length >= 2 && (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {loading ? <p className="p-3 text-sm text-slate-500">Searching catalog…</p>
            : error ? <p role="alert" className="p-3 text-sm text-rose-700">{error}</p>
              : results.length ? results.map((medicine) => (
                <button key={medicine.id} type="button" onClick={() => { onSelect(medicine); setQuery(''); setResults([]) }} className="block min-h-14 w-full border-b border-slate-100 p-3 text-left last:border-0 hover:bg-sky-50">
                  <span className="block font-medium text-slate-900">{medicine.brand_name || medicine.generic_name}{medicine.strength ? ` · ${medicine.strength}` : ''}</span>
                  <span className="mt-0.5 block text-xs text-slate-600">{medicine.generic_name}{medicine.dosage_form ? ` · ${medicine.dosage_form}` : ''}{medicine.manufacturer ? ` · ${medicine.manufacturer}` : ''}</span>
                  <span className="mt-1 block text-[11px] text-slate-400">{medicine.source_name} · verified {medicine.verified_at}</span>
                </button>
              )) : <p className="p-3 text-sm text-slate-600">No catalog matches. You can still enter a medicine manually; catalog data is not a prescribing recommendation.</p>}
        </div>
      )}
      <p className="mt-1 text-xs text-slate-500">Results load only as you search. Catalog entries identify products; they do not recommend treatment or dosage.</p>
    </div>
  )
}
