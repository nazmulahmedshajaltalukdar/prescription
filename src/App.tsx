import React, { useState } from 'react'
import { Home, Inbox, MoreHorizontal, Users, CalendarDays } from 'lucide-react'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import { useAuth } from './services/auth'

export default function App() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return (
    <div className="flex min-h-dvh bg-slate-50">
      <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <Header onMenuClick={() => setMobileNavOpen(true)} />
        <main className="min-w-0 flex-1 overflow-x-hidden px-3 pb-24 pt-4 sm:px-5 md:overflow-y-auto md:p-6">
          <Outlet />
        </main>
      </div>
      <nav aria-label="Primary navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5 gap-1">
          {[
            { label: 'Home', to: '/', icon: Home },
            { label: 'Appointments', to: '/appointments', icon: Inbox },
            { label: 'Patients', to: '/patients', icon: Users },
            { label: 'Calendar', to: '/calendar', icon: CalendarDays },
          ].map(({ label, to, icon: Icon }) => {
            const active = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)
            return <Link key={to} to={to} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-medium ${active ? 'text-sky-700' : 'text-slate-500'}`}><Icon className="h-5 w-5" /><span>{label}</span></Link>
          })}
          <button type="button" onClick={() => setMobileNavOpen(true)} className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-medium text-slate-500"><MoreHorizontal className="h-5 w-5" /><span>More</span></button>
        </div>
      </nav>
    </div>
  )
}
