import React, { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../services/auth'
import { isSupabaseConfigured } from '../services/supabaseClient'

export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send the recovery email.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
        <h1 className="text-2xl font-semibold text-slate-900">Recover your account</h1>
        <p className="mt-2 text-sm text-slate-500">Enter your account email to receive a password reset link.</p>

        {!isSupabaseConfigured() ? (
          <p className="mt-6 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Password recovery is unavailable in demo mode. Configure Supabase to continue.
          </p>
        ) : sent ? (
          <p role="status" className="mt-6 rounded-md bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
            If an account exists for that email, a recovery link has been sent.
          </p>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={submit}>
            <div>
              <label htmlFor="recovery-email" className="mb-1 block text-sm font-medium text-slate-700">Email</label>
              <input
                id="recovery-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
                placeholder="name@clinic.com"
              />
            </div>
            {error && <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-blue-600 px-3 py-2 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {submitting ? 'Sending...' : 'Send recovery link'}
            </button>
          </form>
        )}

        <Link to="/login" className="mt-6 inline-block text-sm font-medium text-blue-700 hover:text-blue-800">
          Back to sign in
        </Link>
      </div>
    </div>
  )
}