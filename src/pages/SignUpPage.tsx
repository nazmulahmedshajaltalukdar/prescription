import React, { FormEvent, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../services/auth'
import { getSupabaseConfigError, isSupabaseConfigured } from '../services/supabaseClient'

export default function SignUpPage() {
  const { user, loading, signUpClinic } = useAuth()
  const [fullName, setFullName] = useState('')
  const [clinicName, setClinicName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const configError = getSupabaseConfigError()

  if (loading) return <div className="flex min-h-screen items-center justify-center">Loading...</div>
  if (user) return <Navigate to="/" replace />

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      const authenticated = await signUpClinic({ fullName, clinicName, email, password })
      setSignedIn(authenticated)
      setCreated(true)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to create clinic account.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
      <div className="w-full max-w-lg rounded-xl bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">Register your clinic</h1>
          <p className="mt-2 text-sm text-slate-500">Create your owner account and start with the 5-user clinic plan.</p>
        </div>

        {configError && <p role="alert" className="mb-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{configError}</p>}
        {!isSupabaseConfigured() ? (
          <p className="rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-800">Clinic registration requires a configured Supabase project. Demo accounts cannot create clinics.</p>
        ) : created ? (
          <div className="space-y-4">
            <p role="status" className="rounded-md bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
              {signedIn
                ? 'Your clinic account is active. Email confirmation is disabled in this Supabase project.'
                : `Registration received. Check ${email} and confirm your email before signing in. Your clinic owner access is activated after verification.`}
            </p>
            <Link to={signedIn ? '/' : '/login'} className="inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              {signedIn ? 'Open dashboard' : 'Continue to sign in'}
            </Link>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Your full name</span>
              <input autoComplete="name" maxLength={120} required value={fullName} onChange={(event) => setFullName(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Clinic name</span>
              <input maxLength={120} required value={clinicName} onChange={(event) => setClinicName(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
              <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Password</span>
              <input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none" />
              <span className="mt-1 block text-xs text-slate-500">At least 8 characters.</span>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Confirm password</span>
              <input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none" />
            </label>
            {error && <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <button type="submit" disabled={submitting} className="w-full rounded-md bg-blue-600 px-3 py-2 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300">
              {submitting ? 'Creating clinic...' : 'Create clinic account'}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-slate-600">Already have an account? <Link to="/login" className="font-medium text-blue-700 hover:text-blue-800">Sign in</Link></p>
        <p className="mt-3 text-center text-xs text-slate-500">Your clinic and owner profile are provisioned by the database. Email verification is required before access.</p>
      </div>
    </div>
  )
}
