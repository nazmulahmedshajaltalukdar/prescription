import React from 'react'
import { Home, Clipboard, FileText, Users, ShieldCheck, CalendarDays, ListOrdered, Settings, UserCircle2, Wallet, FlaskConical, Sparkles } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../services/auth'
import { isTenantModuleEnabled } from '../services/adminManagement'

const items = [
  { label: 'Dashboard', to: '/', icon: Home },
  { label: 'Patients', to: '/patients', icon: Users },
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

export default function Sidebar() {
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

  return (
    <aside className="w-72 border-r border-slate-200 bg-slate-950 text-slate-100">
      <div className="border-b border-slate-800 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/20 text-lg font-semibold text-sky-300">
            CP
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Clinic Pulse</h1>
            <p className="text-xs text-slate-400">Offline-first care</p>
          </div>
        </div>
      </div>

      <nav className="p-4">
        <ul className="space-y-2">
          {visibleItems.map((it) => (
            <li key={it.to}>
              <Link
                to={it.to}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                  isActive(it.to)
                    ? 'bg-slate-800 text-white shadow-sm ring-1 ring-white/10'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <it.icon className="h-4 w-4" />
                <span>{it.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}
