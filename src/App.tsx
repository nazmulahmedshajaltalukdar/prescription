import React from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import { useAuth } from './services/auth'

export default function App() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return (
    <div className="h-screen flex bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
