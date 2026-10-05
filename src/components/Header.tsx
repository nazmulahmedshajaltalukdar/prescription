import React from 'react'
import { Bell, Menu, UserCircle2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../services/auth'

export default function Header() {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()

  return (
    <header className="border-b border-slate-200 bg-white/80 px-5 py-4 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-600 transition hover:bg-slate-100">
            <Menu className="h-4 w-4" />
          </button>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Welcome</p>
            <p className="text-base font-semibold text-slate-800">{user?.full_name || 'Guest'}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
            {user?.plan_tier ? user.plan_tier.replace('_', ' ').toUpperCase() : 'STANDARD'}
          </div>
          <button className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-600 hover:bg-slate-100">
            <Bell className="h-4 w-4" />
          </button>
          <button
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={async () => {
              await signOut()
              navigate('/login', { replace: true })
            }}
          >
            Sign out
          </button>
          <button
            type="button"
            aria-label="Open profile"
            onClick={() => navigate('/profile')}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-100 text-sky-700 hover:bg-sky-200"
          >
            <UserCircle2 className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  )
}
