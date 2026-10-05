import React from 'react'
import { Cloud, CloudOff, HardDrive } from 'lucide-react'
import { getExternalClinicStatus } from '../services/externalClinicAdapter'
import { getSupabaseConfigError, isSupabaseConfigured } from '../services/supabaseClient'

export default function IntegrationStatus() {
  const external = getExternalClinicStatus()
  const supabaseConfigured = isSupabaseConfigured()
  const supabaseMessage = getSupabaseConfigError()

  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 font-medium text-emerald-800">
        <HardDrive className="h-3.5 w-3.5" /> Internal clinic: active
      </span>
      <span
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-medium ${
          supabaseConfigured
            ? 'border-sky-200 bg-sky-50 text-sky-800'
            : 'border-amber-200 bg-amber-50 text-amber-800'
        }`}
        title={supabaseMessage || 'Supabase credentials are configured; remote connectivity is not checked here.'}
      >
        {supabaseConfigured ? <Cloud className="h-3.5 w-3.5" /> : <CloudOff className="h-3.5 w-3.5" />}
        Supabase: {supabaseConfigured ? 'configured' : supabaseMessage ? 'configuration error' : 'demo mode'}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-600" title={external.message}>
        <CloudOff className="h-3.5 w-3.5" /> External clinic: not configured
      </span>
    </div>
  )
}