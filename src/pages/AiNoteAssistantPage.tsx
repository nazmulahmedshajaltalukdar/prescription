import React, { useState } from 'react'
import { generateAdministrativeNote, MAX_NOTE_INPUT_LENGTH, NoteAssistantAction } from '../services/aiNoteAssistant'
import { isTenantModuleEnabled } from '../services/adminManagement'
import { useAuth } from '../services/auth'

export default function AiNoteAssistantPage() {
  const { user } = useAuth()
  const [action, setAction] = useState<NoteAssistantAction>('summarize')
  const [text, setText] = useState('')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (!isTenantModuleEnabled(user, 'ai')) {
    return (
      <div className="mx-auto max-w-xl rounded border border-dashed border-slate-300 bg-white p-6 text-slate-600 shadow-sm">
        AI note assistance is not enabled for this clinic. Contact your platform owner.
      </div>
    )
  }

  const generateDraft = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setDraft('')
    setLoading(true)
    try {
      const result = await generateAdministrativeNote({ action, text })
      setDraft(result.draft)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to generate a draft. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">AI administrative note assistant</h1>
        <p className="mt-1 text-sm text-slate-600">
          Create a summary or organize clinician-provided text into an administrative note.
        </p>
      </header>

      <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>Draft only — clinician review required.</strong> This tool does not diagnose, recommend
        treatment, or prescribe. It must not be used to make autonomous medical decisions. Review and
        edit every result before using it. Submitted text is sent to the clinic-configured AI provider;
        do not include information that is not needed for the note.
      </div>

      <form onSubmit={generateDraft} className="space-y-4 rounded bg-white p-6 shadow-sm">
        <label className="block text-sm font-medium text-slate-700" htmlFor="note-action">
          What should the assistant do?
        </label>
        <select
          id="note-action"
          value={action}
          onChange={(event) => setAction(event.target.value as NoteAssistantAction)}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="summarize">Summarize administrative note text</option>
          <option value="draft">Organize text as an administrative note</option>
        </select>

        <label className="block text-sm font-medium text-slate-700" htmlFor="note-input">
          Clinician-entered text
        </label>
        <textarea
          id="note-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={MAX_NOTE_INPUT_LENGTH}
          rows={9}
          required
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          placeholder="Enter the text you want summarized or organized. No diagnosis or prescribing requests."
        />
        <div className="text-right text-xs text-slate-500">
          {text.length.toLocaleString()} / {MAX_NOTE_INPUT_LENGTH.toLocaleString()}
        </div>

        <button
          type="submit"
          disabled={loading || !text.trim()}
          className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Generating draft…' : 'Generate draft'}
        </button>
      </form>

      {error && (
        <div role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {draft && (
        <section aria-labelledby="ai-draft-heading" className="rounded border border-blue-200 bg-white p-6 shadow-sm">
          <h2 id="ai-draft-heading" className="font-semibold text-slate-900">
            AI-generated draft — clinician review required
          </h2>
          <p className="mb-3 mt-1 text-sm text-amber-800">
            Not a final note. Check accuracy and edit before use.
          </p>
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-slate-800">{draft}</pre>
        </section>
      )}
    </div>
  )
}
