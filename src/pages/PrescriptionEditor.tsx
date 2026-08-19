// src/pages/PrescriptionEditor.tsx
import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { db } from '../services/db'
import { Prescription, PrescriptionItem } from '../types'
import MedicineInput from '../components/MedicineInput'

export default function PrescriptionEditor() {
  const loc = useLocation()
  const navigate = useNavigate()
  const patientId = (loc.state as any)?.patientId
  const [items, setItems] = useState<PrescriptionItem[]>([
    { generic: '', brand: '', dose: '', frequency: '', duration: '', instructions: '' },
  ])
  const [notes, setNotes] = useState('')
  const [patientName, setPatientName] = useState('')
  const [saving, setSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine)

  const LOCAL_BRANDS = [
    'Napa 500mg',
    'Seclo 100mg',
    'Paracetamol 500mg',
    'Omeprazole 20mg',
    'Amoxicillin 500mg',
  ]

  useEffect(() => {
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    // load draft
    try {
      const d = localStorage.getItem('prescription:draft')
      if (d) {
        const draft = JSON.parse(d)
        setPatientName(draft.patientName || '')
        setItems(draft.items || items)
        setNotes(draft.notes || '')
      }
    } catch (e) {
      // ignore
    }

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // autosave draft to localStorage every 20s
  useEffect(() => {
    const id = setInterval(() => {
      const draft = { patientName, items, notes, updatedAt: Date.now() }
      localStorage.setItem('prescription:draft', JSON.stringify(draft))
      setStatusMessage('Draft autosaved')
      setTimeout(() => setStatusMessage(null), 1200)
    }, 20000)
    return () => clearInterval(id)
  }, [patientName, items, notes])

  const addRow = () =>
    setItems((s) => [...s, { generic: '', brand: '', dose: '', frequency: '', duration: '', instructions: '' }])

  const updateItem = (idx: number, partial: Partial<PrescriptionItem>) => {
    setItems((s) => {
      const copy = [...s]
      copy[idx] = { ...copy[idx], ...partial }
      return copy
    })
  }

  const validate = () => {
    if (!patientName.trim() && !patientId) return 'Patient name is required'
    const hasItem = items.some((it) => it.generic || it.brand)
    if (!hasItem) return 'Add at least one medicine'
    return null
  }

  const save = async () => {
    const v = validate()
    if (v) {
      setStatusMessage(v)
      setTimeout(() => setStatusMessage(null), 2500)
      return
    }

    setSaving(true)
    try {
      // create a lightweight visit if none exists
      let visitId = patientId
      if (!visitId) {
        const visit = await db.visits.add({ patient_id: 'local', visit_type: 'walk-in', status: 'done', created_at: new Date().toISOString() } as any)
        visitId = String(visit)
      }

      const prescription: Prescription = {
        visit_id: String(visitId),
        items,
        notes,
        created_at: new Date().toISOString(),
      }

      const id = await db.prescriptions.add(prescription as any)
      // queue for sync (pushToQueue exists in ClinicDB)
      if ((db as any).pushToQueue) {
        await (db as any).pushToQueue('prescriptions', { ...prescription, id }, 'create')
      }

      setStatusMessage(`Saved locally (id: ${id}) ${isOnline ? '(online)' : '(offline)'}`)
      // clear draft and form
      localStorage.removeItem('prescription:draft')
      setItems([
        { generic: '', brand: '', dose: '', frequency: '', duration: '', instructions: '' },
      ])
      setNotes('')
      setPatientName('')
      // optional: navigate to list
      setTimeout(() => navigate('/prescriptions'), 700)
    } catch (err) {
      console.error(err)
      setStatusMessage('Failed to save locally')
    } finally {
      setSaving(false)
      setTimeout(() => setStatusMessage(null), 3000)
    }
  }

  const removeRow = (idx: number) => setItems((s) => s.filter((_, i) => i !== idx))

  return (
    <div className="max-w-4xl mx-auto bg-white shadow p-6 rounded">
      <h2 className="text-xl font-semibold mb-4">Prescription Editor</h2>
      <div className="mb-2">
        <strong>Status:</strong> {isOnline ? 'Online' : 'Offline'}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          Patient name
          <input className="mt-1 block w-full border rounded p-2" value={patientName} onChange={(e) => setPatientName(e.target.value)} />
        </label>

        <div />
      </div>

      <div className="mt-4 space-y-3">
        {items.map((it, idx) => (
          <div key={idx} className="grid grid-cols-6 gap-2 items-center">
            <input className="col-span-2 border rounded p-2" placeholder="Generic" value={it.generic} onChange={(e) => updateItem(idx, { generic: e.target.value })} />
            <input className="col-span-1 border rounded p-2" placeholder="Brand" value={it.brand} onChange={(e) => updateItem(idx, { brand: e.target.value })} />
            <input className="col-span-1 border rounded p-2" placeholder="Dose" value={it.dose} onChange={(e) => updateItem(idx, { dose: e.target.value })} />
            <input className="col-span-1 border rounded p-2" placeholder="Freq" value={it.frequency} onChange={(e) => updateItem(idx, { frequency: e.target.value })} />
            <button className="col-span-1 text-red-600" onClick={() => removeRow(idx)} aria-label={`remove-${idx}`}>
              Remove
            </button>
          </div>
        ))}

        <div className="flex gap-2">
          <button onClick={addRow} className="px-3 py-1 border rounded">Add row</button>
        </div>

        <div>
          <label className="block">Notes</label>
          <textarea className="w-full border rounded p-2" rows={4} placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div>
          <label className="block">Medicines (quick add)</label>
          <MedicineInput value={items.map((it) => ({ name: it.brand || it.generic }))} onChange={(m) => setItems(m.map((mm) => ({ generic: mm.name, brand: mm.name })) as any)} suggestions={LOCAL_BRANDS} />
        </div>

        <div className="flex justify-end">
          <button onClick={save} disabled={saving} className="px-4 py-2 bg-green-600 text-white rounded">
            {saving ? 'Saving...' : 'Save Prescription'}
          </button>
        </div>

        {statusMessage && <div className="mt-2 text-sm text-gray-700">{statusMessage}</div>}
      </div>
    </div>
  )
}
