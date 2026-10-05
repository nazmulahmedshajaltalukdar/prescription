import React from 'react'
import { Home, Clipboard, FileText, Users, ShieldCheck, CalendarDays, ListOrdered, Settings, UserCircle2, Wallet, FlaskConical, Sparkles, Inbox, X, BookOpen } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../services/auth'
import { isTenantModuleEnabled } from '../services/adminManagement'

const items = [
  { label: 'Dashboard', to: '/', icon: Home },
  { label: 'Patients', to: '/patients', icon: Users },
  { label: 'Appointments', to: '/appointments', icon: Inbox },
  { label: 'Clinical catalog', to: '/catalog', icon: BookOpen },
  { label: 'Calendar', to: '/calendar', icon: CalendarDays },
  { label: 'Serial queue', to: '/queue', icon: ListOrdered },
  { label: 'Prescription', to: '/prescription', icon: Clipboard },
  { label: 'Records', to: '/prescriptions', icon: FileText },
  { label: 'Inventory', to: '/inventory', icon: ShieldCheck, module: 'inventory' },
  { label: 'Pharmacy', to: '/pharmacy', icon: FileText, module: 'pharmacy' },
  { label: 'Billing', to: '/billing', icon: Wallet, module: 'billing' },
  { label: 'Laboratory', to: '/labs', icon: FlaskConical, module: 'labs' },
  { label: 'AI notes', to: '/ai-notes', icon: Sparkles, module: 'ai' },
  { label: 'Profile', to: '/profile', icon: UserCircle2 },
  { label: 'Settings', to: '/settings', icon: Settings },
]

type SidebarItem = (typeof items)[number]

export default function Sidebar({ mobileOpen = false, onClose = () => {} }: { mobileOpen?: boolean; onClose?: () => void }) {
  const loc = useLocation()
  const { user } = useAuth()
  const dashboardLabel = user?.role === 'platform_owner'
    ? 'Platform dashboard'
    : user?.role === 'tenant_admin' || user?.role === 'tenant_owner'
      ? 'Admin dashboard'
      : 'Dashboard'
  const visibleItems: SidebarItem[] = [
    { label: dashboardLabel, to: '/', icon: Home },
    ...items.slice(1).filter((item) => !item.module || isTenantModuleEnabled(user, item.module)),
  ]

  const isActive = (to: string) => to === '/'
    ? loc.pathname === '/'
    : loc.pathname === to || loc.pathname.startsWith(`${to}/`)

  const navigation = (mobile = false) => (
    <>
      <div className="border-b border-slate-800 p-4 xl:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/20 text-lg font-semibold text-sky-300">
            SP
          </div>
          <div className={`${mobile ? 'block' : 'hidden xl:block'} min-w-0`}>
            <h1 className="text-lg font-semibold tracking-tight">SohojPrescription</h1>
            <p className="text-xs text-slate-400">Clinic care, made simple</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close navigation" className="ml-auto rounded-lg p-2 text-slate-300 hover:bg-slate-800 md:hidden"><X className="h-5 w-5" /></button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 xl:p-4">
        <ul className="space-y-1.5">
          {visibleItems.map((it) => (
            <li key={it.to}>
              <Link
                to={it.to}
                title={it.label}
                aria-label={it.label}
                onClick={onClose}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                  isActive(it.to)
                    ? 'bg-slate-800 text-white shadow-sm ring-1 ring-white/10'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <it.icon className="h-5 w-5 shrink-0" />
                <span className={mobile ? 'inline' : 'hidden xl:inline'}>{it.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )

  return (
    <>
      <aside className="hidden h-dvh shrink-0 flex-col border-r border-slate-200 bg-slate-950 text-slate-100 md:flex md:w-16 xl:w-72">
        {navigation()}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" aria-label="Close navigation" onClick={onClose} className="absolute inset-0 bg-slate-950/50" />
          <aside className="absolute inset-y-0 left-0 flex w-[min(19rem,85vw)] flex-col border-r border-slate-800 bg-slate-950 text-slate-100 shadow-2xl">
            {navigation(true)}
          </aside>
        </div>
      )}
    </>
  )
}
