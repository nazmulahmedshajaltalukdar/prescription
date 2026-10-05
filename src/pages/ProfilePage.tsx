import React, { FormEvent, useState } from 'react'
import { KeyRound, Save, UserCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../services/auth'
import { isSupabaseConfigured } from '../services/supabaseClient'

function formatRole(role: string) {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (letter: string) => letter.toUpperCase())
}

export default function ProfilePage() {
  const { user, updateFullName, updatePassword } = useAuth()
  const [fullName, setFullName] = useState(user?.full_name || '')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSavingProfile(true)
    setMessage(null)
    try {
      await updateFullName(fullName)
      setMessage({ type: 'success', text: 'Profile name updated.' })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to update profile.' })
    } finally {
      setSavingProfile(false)
    }
  }

  const savePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match.' })
      return
    }

    setSavingPassword(true)
    try {
      await updatePassword(newPassword)
      setNewPassword('')
      setConfirmPassword('')
      setMessage({ type: 'success', text: 'Password updated successfully.' })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to update password.' })
    } finally {
      setSavingPassword(false)
    }
  }

  if (!user) return null

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Account</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Profile</h1>
        <p className="mt-1 text-sm text-slate-600">Manage your personal account details and password.</p>
      </header>

      {message && (
        <div role={message.type === 'error' ? 'alert' : 'status'} className={`rounded-xl border p-3 text-sm ${message.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {message.text}
        </div>
      )}

      <section className="soft-card p-5">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-xl bg-sky-50 p-2.5 text-sky-700"><UserCircle2 className="h-5 w-5" /></div>
          <div>
            <h2 className="font-semibold text-slate-900">Personal details</h2>
            <p className="text-sm text-slate-500">Your email and clinic access are managed by your administrator.</p>
          </div>
        </div>
        <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="field-label">Full name</span>
            <input required maxLength={120} className="field-input" value={fullName} onChange={(event) => setFullName(event.target.value)} />
          </label>
          <label>
            <span className="field-label">Email</span>
            <input readOnly className="field-input cursor-not-allowed bg-slate-100" value={user.email} />
          </label>
          <label>
            <span className="field-label">Role</span>
            <input readOnly className="field-input cursor-not-allowed bg-slate-100" value={formatRole(user.role)} />
          </label>
          <label>
            <span className="field-label">Plan</span>
            <input readOnly className="field-input cursor-not-allowed bg-slate-100" value={user.plan_tier.replace(/_/g, ' ').toUpperCase()} />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" disabled={savingProfile || fullName.trim() === user.full_name} className="action-button-primary disabled:cursor-not-allowed disabled:opacity-50">
              <Save className="mr-2 h-4 w-4" /> {savingProfile ? 'Saving...' : 'Save profile'}
            </button>
          </div>
        </form>
      </section>

      <section className="soft-card p-5">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-xl bg-amber-50 p-2.5 text-amber-700"><KeyRound className="h-5 w-5" /></div>
          <div>
            <h2 className="font-semibold text-slate-900">Password</h2>
            <p className="text-sm text-slate-500">Choose a password with at least 8 characters.</p>
          </div>
        </div>
        {isSupabaseConfigured() ? (
          <form onSubmit={savePassword} className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="field-label">New password</span>
              <input type="password" minLength={8} autoComplete="new-password" className="field-input" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
            </label>
            <label>
              <span className="field-label">Confirm new password</span>
              <input type="password" minLength={8} autoComplete="new-password" className="field-input" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
            </label>
            <div className="sm:col-span-2">
              <button type="submit" disabled={savingPassword} className="action-button-secondary disabled:cursor-not-allowed disabled:opacity-50">
                {savingPassword ? 'Updating...' : 'Update password'}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-slate-600">Password changes are unavailable in demo mode. Configure Supabase to manage account passwords.</p>
        )}
        <p className="mt-4 text-sm text-slate-500">To manage clinic and app configuration, visit <Link className="font-medium text-sky-700 hover:underline" to="/settings">Settings</Link>.</p>
      </section>
    </div>
  )
}
