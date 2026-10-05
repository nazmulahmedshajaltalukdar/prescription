import React from 'react'
import { Bell, Menu, UserCircle2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../services/auth'

export default function Header({ onMenuClick = () => {} }: { onMenuClick?: () => void }) {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()

  return (
    <header className="border-b border-slate-200 bg-white/90 px-3 py-3 backdrop-blur-sm sm:px-5 sm:py-4">
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-3">
          <button type="button" aria-label="Open navigation" onClick={onMenuClick} className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-600 transition hover:bg-slate-100 md:hidden">
            <Menu className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="hidden text-xs font-medium uppercase tracking-[0.12em] text-slate-500 sm:block">Welcome</p>
            <p className="max-w-[40vw] truncate text-sm font-semibold text-slate-800 sm:max-w-none sm:text-base">{user?.full_name || 'Guest'}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="hidden rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 sm:block">
            {user?.plan_tier ? user.plan_tier.replace('_', ' ').toUpperCase() : 'STANDARD'}
          </div>
          <button type="button" aria-label="Notifications" className="hidden rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-600 hover:bg-slate-100 sm:block">
            <Bell className="h-4 w-4" />
          </button>
          <button
            className="rounded-xl border border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 sm:px-3 sm:text-sm"
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
