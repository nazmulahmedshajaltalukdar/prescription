import React, { FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../services/auth'
import { isSupabaseConfigured, supabase } from '../services/supabaseClient'

export default function SetPasswordPage() {
  const { setPassword } = useAuth()
  const [checkingSession, setCheckingSession] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPasswordValue] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [updated, setUpdated] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true

    const checkSession = async () => {
      if (!isSupabaseConfigured() || !supabase) {
        if (active) setCheckingSession(false)
        return
      }

      const { data, error: sessionError } = await supabase.auth.getSession()
      if (active) {
        setHasSession(Boolean(data.session) && !sessionError)
        setCheckingSession(false)
      }
    }

    void checkSession()
    return () => { active = false }
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      await setPassword(password)
      setUpdated(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update the password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
        <h1 className="text-2xl font-semibold text-slate-900">Set your password</h1>
        <p className="mt-2 text-sm text-slate-500">Use this form from a valid staff invitation or recovery link.</p>

        {checkingSession ? (
          <p className="mt-6 text-sm text-slate-500">Checking your link...</p>
        ) : updated ? (
          <div className="mt-6">
            <p role="status" className="rounded-md bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
              Password updated. You can now continue to the app.
            </p>
            <Link to="/login" className="mt-4 inline-block text-sm font-medium text-blue-700 hover:text-blue-800">
              Continue to sign in
            </Link>
          </div>
        ) : !hasSession ? (
          <div className="mt-6">
            <p role="alert" className="rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-800">
              This link is missing or expired. Request a new recovery link or ask your clinic administrator for a new invitation.
            </p>
            <Link to="/forgot-password" className="mt-4 inline-block text-sm font-medium text-blue-700 hover:text-blue-800">
              Request a recovery link
            </Link>
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={submit}>
            <div>
              <label htmlFor="new-password" className="mb-1 block text-sm font-medium text-slate-700">New password</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(event) => setPasswordValue(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="mb-1 block text-sm font-medium text-slate-700">Confirm password</label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              />
            </div>
            {error && <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-blue-600 px-3 py-2 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {submitting ? 'Updating...' : 'Set password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}