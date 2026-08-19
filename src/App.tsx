import React from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Header from './components/Header'

export default function App() {
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
