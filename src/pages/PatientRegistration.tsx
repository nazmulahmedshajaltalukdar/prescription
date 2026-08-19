// src/pages/PatientRegistration.tsx
import React, { useState } from 'react'
import { db } from '../services/db'
import { Patient } from '../types'
import { useNavigate } from 'react-router-dom'

export default function PatientRegistration() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [dob, setDob] = useState('')
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male')
  const navigate = useNavigate()

  const save = async () => {
    const patient: Patient = {
      name,
      phone,
      date_of_birth: dob || null,
      gender,
      created_at: new Date().toISOString(),
    }
    // save to local dexie
    const id = await db.patients.add(patient as any)
    // push to sync queue
    await db.pushToQueue('patients', { ...patient, id }, 'create')
    // redirect to prescription editor for now
    navigate('/prescription', { state: { patientId: id } })
  }

  return (
    <div className="max-w-3xl mx-auto bg-white shadow p-6 rounded">
      <h2 className="text-xl font-semibold mb-4">Patient Registration</h2>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium">Full name</label>
          <input className="mt-1 block w-full border rounded p-2" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Phone</label>
          <input className="mt-1 block w-full border rounded p-2" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Date of birth</label>
          <input type="date" className="mt-1 block w-full border rounded p-2" value={dob} onChange={(e) => setDob(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Gender</label>
          <select className="mt-1 block w-full border rounded p-2" value={gender} onChange={(e) => setGender(e.target.value as any)}>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <button onClick={save} className="px-4 py-2 bg-blue-600 text-white rounded">Save & Create Visit</button>
      </div>
    </div>
  )
}
