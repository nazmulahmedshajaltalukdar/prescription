import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './styles/index.css'
import App from './App'
import PatientRegistration from './pages/PatientRegistration'
import PrescriptionEditor from './pages/PrescriptionEditor'
import PrescriptionsList from './pages/PrescriptionsList'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<PatientRegistration />} />
          <Route path="prescription" element={<PrescriptionEditor />} />
          <Route path="prescriptions" element={<PrescriptionsList />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
