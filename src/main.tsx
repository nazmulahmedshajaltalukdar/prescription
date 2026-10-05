import React, { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './styles/index.css'
import App from './App'
import { AuthProvider } from './services/auth'

const RoleDashboardPage = lazy(() => import('./pages/RoleDashboardPage'))
const PatientRegistration = lazy(() => import('./pages/PatientRegistration'))
const PrescriptionEditor = lazy(() => import('./pages/PrescriptionEditor'))
const PrescriptionsList = lazy(() => import('./pages/PrescriptionsList'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const SignUpPage = lazy(() => import('./pages/SignUpPage'))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'))
const SetPasswordPage = lazy(() => import('./pages/SetPasswordPage'))
const InventoryPage = lazy(() => import('./pages/InventoryPage'))
const PharmacyPage = lazy(() => import('./pages/PharmacyPage'))
const PatientCrmPage = lazy(() => import('./pages/PatientCrmPage'))
const CalendarPage = lazy(() => import('./pages/CalendarPage'))
const AppointmentInboxPage = lazy(() => import('./pages/AppointmentInboxPage'))
const SerialQueuePage = lazy(() => import('./pages/SerialQueuePage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const BillingPage = lazy(() => import('./pages/BillingPage'))
const LabsPage = lazy(() => import('./pages/LabsPage'))
const AiNoteAssistantPage = lazy(() => import('./pages/AiNoteAssistantPage'))

const loadPage = (page: React.ReactNode) => (
  <Suspense fallback={<div className="flex min-h-48 items-center justify-center text-sm text-slate-500">Loading page...</div>}>
    {page}
  </Suspense>
)

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={loadPage(<LoginPage />)} />
          <Route path="/signup" element={loadPage(<SignUpPage />)} />
          <Route path="/forgot-password" element={loadPage(<ForgotPasswordPage />)} />
          <Route path="/set-password" element={loadPage(<SetPasswordPage />)} />
          <Route path="/" element={<App />}>
            <Route index element={loadPage(<RoleDashboardPage />)} />
            <Route path="patients" element={loadPage(<PatientCrmPage />)} />
            <Route path="patients/new" element={loadPage(<PatientRegistration />)} />
            <Route path="calendar" element={loadPage(<CalendarPage />)} />
            <Route path="appointments" element={loadPage(<AppointmentInboxPage />)} />
            <Route path="queue" element={loadPage(<SerialQueuePage />)} />
            <Route path="prescription" element={loadPage(<PrescriptionEditor />)} />
            <Route path="prescriptions" element={loadPage(<PrescriptionsList />)} />
            <Route path="inventory" element={loadPage(<InventoryPage />)} />
            <Route path="pharmacy" element={loadPage(<PharmacyPage />)} />
            <Route path="billing" element={loadPage(<BillingPage />)} />
            <Route path="labs" element={loadPage(<LabsPage />)} />
            <Route path="ai-notes" element={loadPage(<AiNoteAssistantPage />)} />
            <Route path="profile" element={loadPage(<ProfilePage />)} />
            <Route path="settings" element={loadPage(<SettingsPage />)} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
)
