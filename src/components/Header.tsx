import React from 'react'
import { Menu } from 'lucide-react'

export default function Header() {
  return (
    <header className="flex items-center justify-between p-4 border-b bg-white">
      <div className="flex items-center gap-4">
        <button className="p-2 rounded-md hover:bg-slate-100">
          <Menu className="w-5 h-5" />
        </button>
        <div>
          <div className="text-sm text-clinic-muted">Welcome</div>
          <div className="font-medium">Guest</div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-sm text-clinic-muted">Offline</div>
        <div className="w-8 h-8 rounded-full bg-slate-200" />
      </div>
    </header>
  )
}
