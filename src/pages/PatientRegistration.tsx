// src/pages/PatientRegistration.tsx
import React, { useState } from 'react'
import { db } from '../services/db'
import { Patient } from '../types'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../services/auth'

export default function PatientRegistration() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [dob, setDob] = useState('')
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()
  const { user } = useAuth()

  const save = async () => {
    const trimmedName = name.trim()

    if (!trimmedName) {
      setError('Patient name is required.')
      return
    }

    setError(null)
    setSaving(true)

    try {
      if (!user) throw new Error('Sign in with a clinic account before adding patients.')

      const patient: Patient = {
        tenant_id: user.tenant_id,
        sub_tenant_id: user.sub_tenant_id,
        created_by: user.id,
        name: trimmedName,
        phone: phone.trim() || null,
        date_of_birth: dob || null,
        gender,
        created_at: new Date().toISOString(),
      }

      const [{ id: patientId }] = await db.createRecordsWithSync([{ table: 'patients', item: patient }])

      navigate('/prescription', { state: { patientId } })
    } catch (err) {
      console.error(err)
      setError('Unable to save patient. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto bg-white shadow p-6 rounded">
      <h2 className="text-xl font-semibold mb-4">Patient Registration</h2>

      {error && <div className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

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
        <button onClick={save} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded disabled:cursor-not-allowed disabled:bg-blue-300">
          {saving ? 'Saving...' : 'Save & Create Visit'}
        </button>
      </div>
    </div>
  )
}
