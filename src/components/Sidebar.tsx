import React from 'react'
import { Home, Clipboard, FileText, Users } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

const items = [
  { label: 'Dashboard', to: '/', icon: Home },
  { label: 'Patients', to: '/', icon: Users },
  { label: 'Prescription', to: '/prescription', icon: Clipboard },
  { label: 'Records', to: '/records', icon: FileText },
]

export default function Sidebar() {
  const loc = useLocation()
  return (
    <aside className="w-72 bg-white border-r">
      <div className="p-6 border-b">
        <h1 className="text-lg font-semibold">Clinic Prescription</h1>
        <p className="text-sm text-clinic-muted">Offline-first • AI-assisted</p>
      </div>
      <nav className="p-4">
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.to}>
              <Link
                to={it.to}
                className={`flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-100 $ {
                  loc.pathname === it.to ? 'bg-slate-100 font-medium' : ''
                }`}
              >
                <it.icon className="w-5 h-5" />
                <span>{it.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}
