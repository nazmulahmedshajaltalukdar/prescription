import React, { FormEvent, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../services/auth'
import { getSupabaseConfigError, isSupabaseConfigured } from '../services/supabaseClient'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { user, loading, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const supabaseConfigError = getSupabaseConfigError()

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>
  }

  if (user) {
    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/'
    return <Navigate to={from} replace />
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await signIn(email, password)
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/'
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">SohojPrescription</h1>
          <p className="mt-2 text-sm text-slate-500">Sign in to continue</p>
        </div>

        {searchParams.get('verified') === '1' && (
          <p role="status" className="mb-4 rounded-md bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
            Email verified. Your clinic owner account is ready; sign in to continue.
          </p>
        )}

        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              placeholder="name@clinic.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              placeholder="Enter your password"
            />
          </div>

          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-blue-600 px-3 py-2 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {supabaseConfigError ||
            (isSupabaseConfigured()
              ? 'Sign in with your clinic account.'
              : 'Demo mode is active until Supabase credentials are configured.')}
        </div>
        {isSupabaseConfigured() && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
            <Link to="/signup" className="font-medium text-blue-700 hover:text-blue-800">Register a clinic</Link>
            <Link to="/forgot-password" className="font-medium text-blue-700 hover:text-blue-800">Forgot password?</Link>
            <Link to="/set-password" className="font-medium text-blue-700 hover:text-blue-800">Accept invitation</Link>
          </div>
        )}
      </div>
    </div>
  )
}
