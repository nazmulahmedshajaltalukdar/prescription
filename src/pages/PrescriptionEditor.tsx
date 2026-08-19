// src/pages/PrescriptionEditor.tsx
import React, { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { db } from '../services/db'
import { Prescription, PrescriptionItem } from '../types'

export default function PrescriptionEditor() {
  const loc = useLocation()
  const patientId = (loc.state as any)?.patientId
  const [items, setItems] = useState<PrescriptionItem[]>([
    { generic: '', brand: '', dose: '', frequency: '', duration: '', instructions: '' },
  ])
  const [notes, setNotes] = useState('')

  const addRow = () => setItems((s) => [...s, { generic: '', brand: '', dose: '', frequency: '', duration: '', instructions: '' }])

  const save = async () => {
    if (!patientId) {
      alert('No patient selected')
      return
    }
    // create visit locally
    const visit = await db.visits.add({ patient_id: patientId, visit_type: 'walk-in', status: 'waiting', created_at: new Date().toISOString() } as any)

    const prescription: Prescription = {
      visit_id: String(visit),
      items,
      notes,
      created_at: new Date().toISOString(),
    }
    const id = await db.prescriptions.add(prescription as any)
    await db.pushToQueue('prescriptions', { ...prescription, id }, 'create')
    alert('Prescription saved locally and queued for sync')
  }

  return (
    <div className="max-w-4xl mx-auto bg-white shadow p-6 rounded">
      <h2 className="text-xl font-semibold mb-4">Prescription Editor</h2>
      <div className="space-y-3">
        {items.map((it, idx) => (
          <div key={idx} className="grid grid-cols-6 gap-2 items-center">
            <input className="col-span-2 border rounded p-2" placeholder="Generic" value={it.generic} onChange={(e) => { const copy = [...items]; copy[idx].generic = e.target.value; setItems(copy) }} />
            <input className="col-span-1 border rounded p-2" placeholder="Brand" value={it.brand} onChange={(e) => { const copy = [...items]; copy[idx].brand = e.target.value; setItems(copy) }} />
            <input className="col-span-1 border rounded p-2" placeholder="Dose" value={it.dose} onChange={(e) => { const copy = [...items]; copy[idx].dose = e.target.value; setItems(copy) }} />
            <input className="col-span-1 border rounded p-2" placeholder="Freq" value={it.frequency} onChange={(e) => { const copy = [...items]; copy[idx].frequency = e.target.value; setItems(copy) }} />
            <input className="col-span-1 border rounded p-2" placeholder="Duration" value={it.duration} onChange={(e) => { const copy = [...items]; copy[idx].duration = e.target.value; setItems(copy) }} />
          </div>
        ))}
        <div className="flex gap-2">
          <button onClick={addRow} className="px-3 py-1 border rounded">Add row</button>
        </div>
        <textarea className="w-full border rounded p-2" rows={4} placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex justify-end">
          <button onClick={save} className="px-4 py-2 bg-green-600 text-white rounded">Save Prescription</button>
        </div>
      </div>
    </div>
  )
}
