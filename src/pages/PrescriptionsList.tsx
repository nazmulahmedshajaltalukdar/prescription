import React, { useEffect, useState } from 'react'
import { db } from '../services/db'
import { Prescription } from '../types'

export default function PrescriptionsList() {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])

  useEffect(() => {
    let mounted = true
    const load = async () => {
      const all = await db.prescriptions.orderBy('created_at').reverse().toArray()
      if (mounted) setPrescriptions(all)
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h3 className="text-lg font-medium mb-4">Saved Prescriptions</h3>
      {prescriptions.length === 0 && <div>No prescriptions saved yet.</div>}
      <ul className="space-y-3">
        {prescriptions.map((p) => (
          <li key={p.id} className="border rounded p-3 bg-white shadow">
            <div className="flex justify-between">
              <div>
                <strong>{p.visit_id || '—'}</strong>
                <div className="text-sm text-gray-600">{p.notes}</div>
              </div>
              <div className="text-sm text-gray-500">{p.created_at ? new Date(p.created_at).toLocaleString() : ''}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
