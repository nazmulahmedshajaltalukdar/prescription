// src/components/MedicineInput.tsx
import React, { useState } from 'react'

type Medicine = {
  name: string
  dosage?: string
  duration?: string
}

type Props = {
  value: Medicine[]
  onChange: (m: Medicine[]) => void
  suggestions?: string[]
}

export default function MedicineInput({ value, onChange, suggestions = [] }: Props) {
  const [input, setInput] = useState('')
  const addMedicine = () => {
    const name = input.trim()
    if (!name) return
    onChange([...value, { name }])
    setInput('')
  }
  const removeAt = (idx: number) => {
    const copy = [...value]
    copy.splice(idx, 1)
    onChange(copy)
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          list="meds"
          placeholder="Type medicine (e.g., Napa 500mg)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addMedicine()
            }
          }}
        />
        <button type="button" onClick={addMedicine}>
          Add
        </button>
      </div>
      <datalist id="meds">
        {suggestions.map((s) => (
          <option value={s} key={s} />
        ))}
      </datalist>

      <ul>
        {value.map((m, idx) => (
          <li key={idx}>
            {m.name}{' '}
            <button type="button" onClick={() => removeAt(idx)} aria-label={`remove-${idx}`}>
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
