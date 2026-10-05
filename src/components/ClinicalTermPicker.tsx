import React, { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { ClinicalReferenceTerm, searchClinicalTerms } from '../services/clinicalCatalog'

export default function ClinicalTermPicker({
  category,
  onSelect,
}: {
  category: 'chief_complaint' | 'disease'
  onSelect: (term: ClinicalReferenceTerm) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ClinicalReferenceTerm[]>([])
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
      searchClinicalTerms(search, category)
        .then(({ rows }) => { if (active) setResults(rows) })
        .catch((searchError) => { if (active) setError(searchError instanceof Error ? searchError.message : 'Unable to search clinical terms.') })
        .finally(() => { if (active) setLoading(false) })
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [category, query])

  return (
    <div>
      <label className="relative block">
        <Search className="absolute left-3 top-1/2 h-4 w-4 text-slate-400" />
        <input className="field-input pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={category === 'disease' ? 'Search disease or diagnosis terms' : 'Search chief complaint terms'} autoComplete="off" />
      </label>
      {query.trim().length >= 2 && <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white">
        {loading ? <p className="p-3 text-sm text-slate-500">Searching…</p>
          : error ? <p role="alert" className="p-3 text-sm text-rose-700">{error}</p>
            : results.length ? results.map((term) => <button key={term.id} type="button" onClick={() => { onSelect(term); setQuery(''); setResults([]) }} className="block min-h-11 w-full border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-sky-50">
              <span className="block text-sm font-medium text-slate-900">{term.label_en}{term.label_bn ? ` · ${term.label_bn}` : ''}</span>
              <span className="block text-xs text-slate-500">{term.code}{term.classification_code ? ` · ${term.classification_system}: ${term.classification_code}` : ''}</span>
            </button>)
              : <p className="p-3 text-sm text-slate-600">No verified term found. Enter the clinician’s wording manually.</p>}
      </div>}
    </div>
  )
}
