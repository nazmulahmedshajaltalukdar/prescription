import React from 'react'
import { useAuth } from '../services/auth'
import AdminDashboardPage from './AdminDashboardPage'
import DashboardPage from './DashboardPage'

export default function RoleDashboardPage() {
  const { user } = useAuth()
  if (user?.role === 'platform_owner' || user?.role === 'tenant_owner' || user?.role === 'tenant_admin') {
    return <AdminDashboardPage />
  }
  return <DashboardPage />
}
