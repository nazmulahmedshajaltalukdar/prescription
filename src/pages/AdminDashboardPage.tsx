import React, { FormEvent, useEffect, useMemo, useState } from 'react'
import { Building2, Plus, RefreshCw, Save, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { PlanTier, planOrder, tenantPlans } from '../services/tenantPlans'
import { AuthRole, useAuth } from '../services/auth'
import { ManagedLocation, ManagedTenant, ManagedUser, runAdminAction } from '../services/adminManagement'

const moduleOptions = [
  { id: 'inventory', label: 'Inventory' },
  { id: 'pharmacy', label: 'Pharmacy' },
  { id: 'billing', label: 'Billing' },
  { id: 'labs', label: 'Labs' },
  { id: 'ai', label: 'AI tools' },
]
const clinicStaffRoles: AuthRole[] = ['doctor', 'pharmacist', 'nurse', 'receptionist']
const ownerManagedRoles: AuthRole[] = ['tenant_owner', 'tenant_admin', ...clinicStaffRoles]

export default function AdminDashboardPage() {
  const { user } = useAuth()
  const isPlatformOwner = user?.role === 'platform_owner'
  const [tenants, setTenants] = useState<ManagedTenant[]>([])
  const [selectedTenantId, setSelectedTenantId] = useState('')
  const [locations, setLocations] = useState<ManagedLocation[]>([])
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([])
  const [tenantForm, setTenantForm] = useState<ManagedTenant>({
    id: '',
    name: '',
    plan_tier: 'starter_5',
    status: 'active',
    modules: {},
    created_at: '',
  })
  const [locationForm, setLocationForm] = useState({ id: '', name: '', address: '' })
  const [inviteForm, setInviteForm] = useState({ email: '', full_name: '', role: 'doctor' as AuthRole, sub_tenant_id: '' })
  const [userEdits, setUserEdits] = useState<Record<string, { role: string; sub_tenant_id: string }>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const selectedTenant = tenants.find((tenant) => tenant.id === selectedTenantId)
  const tenantId = isPlatformOwner ? selectedTenantId : user?.tenant_id || ''
  const availableRoles = isPlatformOwner ? ownerManagedRoles : clinicStaffRoles

  const loadTenants = async () => {
    const result = await runAdminAction<{ tenants: ManagedTenant[] }>({ action: 'list_tenants' })
    setTenants(result.tenants)
    setSelectedTenantId((current) => current || result.tenants[0]?.id || '')
  }

  const loadTenantManagement = async (id: string) => {
    if (!id) {
      setLocations([])
      setManagedUsers([])
      return
    }
    const [locationsResult, usersResult] = await Promise.all([
      runAdminAction<{ locations: ManagedLocation[] }>({ action: 'list_locations', tenant_id: id }),
      runAdminAction<{ users: ManagedUser[] }>({ action: 'list_users', tenant_id: id }),
    ])
    setLocations(locationsResult.locations)
    setManagedUsers(usersResult.users)
    setInviteForm((current) => ({ ...current, sub_tenant_id: current.sub_tenant_id || locationsResult.locations.find((location) => location.is_active)?.id || '' }))
    setUserEdits(Object.fromEntries(usersResult.users.map((managedUser) => [managedUser.id, {
      role: managedUser.role,
      sub_tenant_id: managedUser.sub_tenant_id,
    }])))
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    if (!isPlatformOwner) {
      const loadClinic = async () => {
        try {
          const [locationsResult, usersResult] = await Promise.all([
            runAdminAction<{ locations: ManagedLocation[] }>({ action: 'list_locations' }),
            runAdminAction<{ users: ManagedUser[] }>({ action: 'list_users' }),
          ])
          if (!active) return
          setLocations(locationsResult.locations)
          setManagedUsers(usersResult.users)
          setInviteForm((current) => ({ ...current, sub_tenant_id: current.sub_tenant_id || locationsResult.locations.find((location) => location.is_active)?.id || '' }))
          setUserEdits(Object.fromEntries(usersResult.users.map((managedUser) => [managedUser.id, {
            role: managedUser.role,
            sub_tenant_id: managedUser.sub_tenant_id,
          }])))
        } catch (loadError) {
          if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load clinic administration data.')
        } finally {
          if (active) setLoading(false)
        }
      }
      void loadClinic()
      return () => { active = false }
    }

    const loadPlatform = async () => {
      try {
        const result = await runAdminAction<{ tenants: ManagedTenant[] }>({ action: 'list_tenants' })
        if (!active) return
        setTenants(result.tenants)
        const selected = result.tenants.find((tenant) => tenant.id === selectedTenantId) || result.tenants[0]
        if (selected) {
          setSelectedTenantId(selected.id)
          setTenantForm(selected)
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load platform data.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadPlatform()
    return () => { active = false }
  }, [isPlatformOwner, user?.tenant_id])

  useEffect(() => {
    if (!isPlatformOwner || !selectedTenantId) return
    let active = true
    setLoading(true)
    setError(null)
    Promise.all([
      runAdminAction<{ locations: ManagedLocation[] }>({ action: 'list_locations', tenant_id: selectedTenantId }),
      runAdminAction<{ users: ManagedUser[] }>({ action: 'list_users', tenant_id: selectedTenantId }),
    ]).then(([locationsResult, usersResult]) => {
      if (!active) return
      setLocations(locationsResult.locations)
      setManagedUsers(usersResult.users)
      setInviteForm((current) => ({ ...current, sub_tenant_id: locationsResult.locations.find((location) => location.is_active)?.id || '' }))
      setUserEdits(Object.fromEntries(usersResult.users.map((managedUser) => [managedUser.id, {
        role: managedUser.role,
        sub_tenant_id: managedUser.sub_tenant_id,
      }])))
    }).catch((loadError) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load clinic management data.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [isPlatformOwner, selectedTenantId])

  const platformStats = useMemo(() => ({
    tenants: tenants.length,
    active: tenants.filter((tenant) => tenant.status === 'active').length,
    users: managedUsers.length,
  }), [tenants, managedUsers])

  const runAndReport = async (task: () => Promise<void>, successMessage: string) => {
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      await task()
      setNotice(successMessage)
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : 'The requested operation failed.')
    } finally {
      setSaving(false)
    }
  }

  const saveTenant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await runAndReport(async () => {
      const result = await runAdminAction<{ tenant: ManagedTenant }>({
        action: 'save_tenant',
        ...tenantForm,
      })
      await loadTenants()
      setSelectedTenantId(result.tenant.id)
      setTenantForm(result.tenant)
    }, 'Clinic settings saved.')
  }

  const inviteUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await runAndReport(async () => {
      await runAdminAction({
        action: 'invite_user',
        tenant_id: tenantId,
        ...inviteForm,
        plan_tier: selectedTenant?.plan_tier || user?.plan_tier,
      })
      await loadTenantManagement(tenantId)
      setInviteForm((current) => ({ ...current, email: '', full_name: '' }))
    }, 'Invitation sent. The staff member can set their password from the email link.')
  }

  const saveUser = async (managedUser: ManagedUser) => {
    const edit = userEdits[managedUser.id]
    if (!edit) return
    await runAndReport(async () => {
      await runAdminAction({
        action: 'update_user',
        tenant_id: tenantId,
        user_id: managedUser.id,
        role: edit.role,
        sub_tenant_id: edit.sub_tenant_id,
      })
      await loadTenantManagement(tenantId)
    }, 'User access updated.')
  }

  const toggleUser = async (managedUser: ManagedUser) => {
    await runAndReport(async () => {
      await runAdminAction({
        action: 'update_user',
        tenant_id: tenantId,
        user_id: managedUser.id,
        is_active: !managedUser.is_active,
      })
      await loadTenantManagement(tenantId)
    }, managedUser.is_active ? 'User access suspended.' : 'User access restored.')
  }

  const saveLocation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await runAndReport(async () => {
      await runAdminAction({ action: 'save_location', tenant_id: tenantId, ...locationForm })
      await loadTenantManagement(tenantId)
      setLocationForm({ id: '', name: '', address: '' })
    }, 'Clinic location saved.')
  }

  const toggleLocation = async (location: ManagedLocation) => {
    await runAndReport(async () => {
      await runAdminAction({
        action: 'save_location',
        ...location,
        tenant_id: tenantId,
        is_active: !location.is_active,
      })
      await loadTenantManagement(tenantId)
    }, location.is_active ? 'Clinic location deactivated.' : 'Clinic location restored.')
  }

  const selectTenant = (id: string) => {
    setSelectedTenantId(id)
    const tenant = tenants.find((item) => item.id === id)
    if (tenant) setTenantForm(tenant)
  }

  if (!user) return null

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{isPlatformOwner ? 'Platform control center' : 'Clinic administration'}</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">{isPlatformOwner ? 'Platform Owner Dashboard' : 'Admin Dashboard'}</h1>
          <p className="mt-1 text-sm text-slate-600">{isPlatformOwner ? 'Manage clinics, subscriptions, modules, branches, and staff.' : 'Manage your clinic locations and staff access.'}</p>
        </div>
        <button type="button" onClick={() => isPlatformOwner ? void loadTenants().then(() => loadTenantManagement(tenantId)) : void loadTenantManagement(tenantId)} className="action-button-secondary" disabled={loading || saving}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </header>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</div>}

      {isPlatformOwner && (
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Registered clinics', value: platformStats.tenants, icon: Building2 },
            { label: 'Active clinics', value: platformStats.active, icon: ShieldCheck },
            { label: 'Users in selected clinic', value: platformStats.users, icon: Users },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="soft-card flex items-center justify-between p-5">
              <div><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-slate-900">{value}</p></div>
              <Icon className="h-6 w-6 text-sky-700" />
            </div>
          ))}
        </div>
      )}

      {isPlatformOwner && (
        <section className="soft-card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">Clinic portfolio</h2>
              <p className="mt-1 text-sm text-slate-500">Select a clinic to manage its plan, modules, branches, and users.</p>
            </div>
            <select aria-label="Select clinic" className="field-input sm:max-w-sm" value={selectedTenantId} onChange={(event) => selectTenant(event.target.value)}>
              <option value="">Select clinic</option>
              {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name} · {tenant.status}</option>)}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {tenants.map((tenant) => (
              <button key={tenant.id} type="button" onClick={() => selectTenant(tenant.id)} className={`rounded-xl border p-4 text-left transition ${selectedTenantId === tenant.id ? 'border-sky-400 bg-sky-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <span className="flex items-center justify-between gap-2"><span className="font-semibold text-slate-900">{tenant.name}</span><span className={`rounded-full px-2 py-0.5 text-xs ${tenant.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{tenant.status}</span></span>
                <span className="mt-2 block text-xs text-slate-500">{tenant.id} · {tenantPlans[tenant.plan_tier as PlanTier]?.label || tenant.plan_tier}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {isPlatformOwner && (
        <section className="soft-card p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-xl bg-sky-50 p-2.5 text-sky-700"><Building2 className="h-5 w-5" /></div>
            <div><h2 className="font-semibold text-slate-900">{selectedTenantId ? 'Clinic plan and modules' : 'Create a clinic'}</h2><p className="text-sm text-slate-500">Plan limits and feature availability are recorded against the tenant.</p></div>
          </div>
          <form onSubmit={saveTenant} className="grid gap-4 md:grid-cols-2">
            <label><span className="field-label">Clinic ID</span><input required pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,62}" disabled={Boolean(selectedTenantId)} className="field-input disabled:bg-slate-100" value={tenantForm.id} onChange={(event) => setTenantForm({ ...tenantForm, id: event.target.value })} placeholder="clinic-acme" /></label>
            <label><span className="field-label">Clinic name</span><input required className="field-input" value={tenantForm.name} onChange={(event) => setTenantForm({ ...tenantForm, name: event.target.value })} /></label>
            <label><span className="field-label">Subscription plan</span><select className="field-input" value={tenantForm.plan_tier} onChange={(event) => setTenantForm({ ...tenantForm, plan_tier: event.target.value })}>{planOrder.map((tier) => <option key={tier} value={tier}>{tenantPlans[tier].label} · max {tenantPlans[tier].userLimit} users</option>)}</select></label>
            <label><span className="field-label">Clinic status</span><select className="field-input" value={tenantForm.status} onChange={(event) => setTenantForm({ ...tenantForm, status: event.target.value as ManagedTenant['status'] })}><option value="active">Active</option><option value="suspended">Suspended</option></select></label>
            <fieldset className="md:col-span-2"><legend className="field-label">Feature modules</legend><div className="grid gap-2 sm:grid-cols-3">{moduleOptions.map((module) => <label key={module.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm text-slate-700"><input type="checkbox" checked={Boolean(tenantForm.modules[module.id])} onChange={(event) => setTenantForm({ ...tenantForm, modules: { ...tenantForm.modules, [module.id]: event.target.checked } })} />{module.label}</label>)}</div></fieldset>
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <button type="submit" disabled={saving} className="action-button-primary"><Save className="mr-2 h-4 w-4" />{saving ? 'Saving...' : 'Save clinic'}</button>
              <button type="button" className="action-button-secondary" onClick={() => { setSelectedTenantId(''); setTenantForm({ id: '', name: '', plan_tier: 'starter_5', status: 'active', modules: {}, created_at: '' }) }}><Plus className="mr-2 h-4 w-4" />New clinic</button>
            </div>
          </form>
        </section>
      )}

      {!isPlatformOwner && (
        <div className="soft-card flex flex-wrap items-center justify-between gap-3 p-5">
          <div><h2 className="font-semibold text-slate-900">{user.tenant_id}</h2><p className="mt-1 text-sm text-slate-500">Your clinic subscription and shared data are managed within this tenant.</p></div>
          <span className="rounded-full bg-sky-50 px-3 py-1 text-sm font-medium text-sky-800">{user.role.replace(/_/g, ' ')}</span>
        </div>
      )}

      <section className="soft-card p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-violet-50 p-2.5 text-violet-700"><Users className="h-5 w-5" /></div>
          <div><h2 className="font-semibold text-slate-900">Staff and user access</h2><p className="text-sm text-slate-500">Invite staff, set their clinic role/location, or suspend and restore access.</p></div>
        </div>
        <form onSubmit={inviteUser} className="mb-6 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-5">
          <label><span className="field-label">Full name</span><input required className="field-input" value={inviteForm.full_name} onChange={(event) => setInviteForm({ ...inviteForm, full_name: event.target.value })} /></label>
          <label><span className="field-label">Email</span><input type="email" required className="field-input" value={inviteForm.email} onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })} /></label>
          <label><span className="field-label">Role</span><select className="field-input" value={inviteForm.role} onChange={(event) => setInviteForm({ ...inviteForm, role: event.target.value as AuthRole })}>{availableRoles.map((role) => <option key={role} value={role}>{role.replace(/_/g, ' ')}</option>)}</select></label>
          <label><span className="field-label">Clinic location</span><select required className="field-input" value={inviteForm.sub_tenant_id} onChange={(event) => setInviteForm({ ...inviteForm, sub_tenant_id: event.target.value })}><option value="">Select location</option>{locations.filter((location) => location.is_active).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
          <div className="flex items-end"><button type="submit" disabled={saving || loading || !locations.some((location) => location.is_active)} className="action-button-primary w-full"><UserPlus className="mr-2 h-4 w-4" />Invite staff</button></div>
        </form>

        {loading ? <p className="py-5 text-sm text-slate-500">Loading users and locations...</p> : managedUsers.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">User</th><th className="px-3 py-3">Role</th><th className="px-3 py-3">Location</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {managedUsers.map((managedUser) => {
                  const edit = userEdits[managedUser.id] || { role: managedUser.role, sub_tenant_id: managedUser.sub_tenant_id }
                  const canManageTarget = managedUser.id !== user.id && managedUser.role !== 'platform_owner' && (isPlatformOwner || clinicStaffRoles.includes(managedUser.role as AuthRole))
                  return <tr key={managedUser.id}>
                    <td className="px-3 py-3"><span className="block font-medium text-slate-800">{managedUser.full_name || 'Unnamed user'}</span><span className="text-xs text-slate-500">{managedUser.id}</span></td>
                    <td className="px-3 py-3">{canManageTarget ? <select className="field-input min-w-36" value={edit.role} onChange={(event) => setUserEdits({ ...userEdits, [managedUser.id]: { ...edit, role: event.target.value } })}>{availableRoles.map((role) => <option key={role} value={role}>{role.replace(/_/g, ' ')}</option>)}</select> : <span className="capitalize text-slate-700">{managedUser.role.replace(/_/g, ' ')}</span>}</td>
                    <td className="px-3 py-3">{canManageTarget ? <select className="field-input min-w-36" value={edit.sub_tenant_id} onChange={(event) => setUserEdits({ ...userEdits, [managedUser.id]: { ...edit, sub_tenant_id: event.target.value } })}>{locations.filter((location) => location.is_active).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select> : <span className="text-slate-700">{locations.find((location) => location.id === managedUser.sub_tenant_id)?.name || managedUser.sub_tenant_id}</span>}</td>
                    <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${managedUser.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{managedUser.is_active ? 'Active' : 'Suspended'}</span></td>
                    <td className="px-3 py-3"><div className="flex gap-2">{canManageTarget && <button type="button" onClick={() => void saveUser(managedUser)} disabled={saving} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">Save</button>}{canManageTarget && <button type="button" onClick={() => void toggleUser(managedUser)} disabled={saving} className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${managedUser.is_active ? 'border-rose-200 text-rose-700 hover:bg-rose-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'}`}>{managedUser.is_active ? 'Suspend' : 'Restore'}</button>}</div></td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="py-5 text-sm text-slate-500">No clinic users found.</p>}
      </section>

      {(isPlatformOwner || user.role === 'tenant_owner' || user.role === 'tenant_admin') && (
        <section className="soft-card p-5">
          <div className="mb-4"><h2 className="font-semibold text-slate-900">Clinic locations</h2><p className="mt-1 text-sm text-slate-500">Each location is an access boundary for staff and clinic records.</p></div>
          <form onSubmit={saveLocation} className="mb-4 grid gap-3 sm:grid-cols-3">
            <label><span className="field-label">Location ID</span><input required pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,62}" className="field-input" value={locationForm.id} onChange={(event) => setLocationForm({ ...locationForm, id: event.target.value })} placeholder="branch-east" /></label>
            <label><span className="field-label">Location name</span><input required className="field-input" value={locationForm.name} onChange={(event) => setLocationForm({ ...locationForm, name: event.target.value })} /></label>
            <label><span className="field-label">Address</span><input className="field-input" value={locationForm.address} onChange={(event) => setLocationForm({ ...locationForm, address: event.target.value })} /></label>
            <div className="sm:col-span-3"><button type="submit" disabled={saving || !tenantId} className="action-button-secondary"><Plus className="mr-2 h-4 w-4" />Add / update location</button></div>
          </form>
          <ul className="divide-y divide-slate-100">{locations.map((location) => <li key={location.id} className="flex items-center justify-between gap-4 py-3"><span><span className="font-medium text-slate-800">{location.name}</span><span className="ml-2 text-xs text-slate-500">{location.id}{location.address ? ` · ${location.address}` : ''}</span></span><span className="flex items-center gap-3"><span className={`text-xs font-medium ${location.is_active ? 'text-emerald-700' : 'text-slate-500'}`}>{location.is_active ? 'Active' : 'Inactive'}</span><button type="button" onClick={() => void toggleLocation(location)} disabled={saving} className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${location.is_active ? 'border-rose-200 text-rose-700 hover:bg-rose-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'}`}>{location.is_active ? 'Deactivate' : 'Restore'}</button></span></li>)}</ul>
        </section>
      )}
    </div>
  )
}
