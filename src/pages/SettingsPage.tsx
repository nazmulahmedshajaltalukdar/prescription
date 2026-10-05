import React, { useEffect, useState } from 'react'
import { Cloud, HardDrive, Settings2, ShieldCheck, Wifi, WifiOff } from 'lucide-react'
import { Link } from 'react-router-dom'
import IntegrationStatus from '../components/IntegrationStatus'
import { useAuth } from '../services/auth'
import { isTenantModuleEnabled } from '../services/adminManagement'
import { getSupabaseConfigError, isSupabaseConfigured } from '../services/supabaseClient'

export default function SettingsPage() {
  const { user } = useAuth()
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const configError = getSupabaseConfigError()

  useEffect(() => {
    const online = () => setIsOnline(true)
    const offline = () => setIsOnline(false)
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
    }
  }, [])

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Workspace</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-600">Review your clinic access, app status, and enabled modules.</p>
      </header>

      <section className="soft-card p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-sky-50 p-2.5 text-sky-700"><Settings2 className="h-5 w-5" /></div>
          <div>
            <h2 className="font-semibold text-slate-900">Clinic workspace</h2>
            <p className="text-sm text-slate-500">Access scope is managed by your clinic administrator.</p>
          </div>
        </div>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div><dt className="field-label">Clinic / tenant</dt><dd className="break-all text-sm text-slate-800">{user?.tenant_id || '—'}</dd></div>
          <div><dt className="field-label">Location / sub-clinic</dt><dd className="break-all text-sm text-slate-800">{user?.sub_tenant_id || 'All locations'}</dd></div>
          <div><dt className="field-label">Your role</dt><dd className="text-sm capitalize text-slate-800">{user?.role.replace(/_/g, ' ') || '—'}</dd></div>
          <div><dt className="field-label">Subscription plan</dt><dd className="text-sm text-slate-800">{user?.plan_tier.replace(/_/g, ' ').toUpperCase() || '—'}</dd></div>
        </dl>
        <Link to="/profile" className="action-button-secondary mt-5">Manage profile</Link>
      </section>

      <section className="soft-card p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><ShieldCheck className="h-5 w-5" /></div>
          <div>
            <h2 className="font-semibold text-slate-900">Application status</h2>
            <p className="text-sm text-slate-500">Connection and modules available in this environment.</p>
          </div>
        </div>
        <div className="mb-4"><IntegrationStatus /></div>
        <dl className="divide-y divide-slate-100">
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="flex items-center gap-2 text-sm text-slate-700">{isOnline ? <Wifi className="h-4 w-4 text-emerald-600" /> : <WifiOff className="h-4 w-4 text-amber-600" />} Network</dt>
            <dd className={`text-sm font-medium ${isOnline ? 'text-emerald-700' : 'text-amber-700'}`}>{isOnline ? 'Online' : 'Offline'}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="flex items-center gap-2 text-sm text-slate-700"><Cloud className="h-4 w-4 text-sky-600" /> Supabase</dt>
            <dd className="text-right text-sm text-slate-600">{isSupabaseConfigured() ? 'Configured (remote sync status not verified here)' : configError || 'Not configured; using browser-local demo data'}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="flex items-center gap-2 text-sm text-slate-700"><HardDrive className="h-4 w-4 text-slate-500" /> Browser-local storage</dt>
            <dd className="text-sm text-slate-600">Active · offline records remain on this device</dd>
          </div>
          {['inventory', 'pharmacy', 'billing', 'labs', 'ai'].map((module) => (
            <div key={module} className="flex items-center justify-between gap-4 py-3">
              <dt className="text-sm capitalize text-slate-700">{module === 'ai' ? 'AI tools' : module}</dt>
              <dd className={`text-sm font-medium ${isTenantModuleEnabled(user, module) ? 'text-emerald-700' : 'text-slate-500'}`}>{isTenantModuleEnabled(user, module) ? 'Enabled' : 'Disabled'}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Clinic scope, role, plan, and backend credentials cannot be changed here. Ask your administrator to update clinic access.
      </p>
    </div>
  )
}
