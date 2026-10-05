import { supabase } from './supabaseClient'

export const isTenantModuleEnabled = (user: { tenant_modules?: Record<string, boolean> } | null, module: string) =>
  Boolean(user?.tenant_modules?.[module])

export interface ManagedTenant {
  id: string
  name: string
  plan_tier: string
  status: 'active' | 'suspended'
  modules: Record<string, boolean>
  created_at: string
}

export interface ManagedUser {
  id: string
  full_name: string
  role: string
  tenant_id: string
  sub_tenant_id: string
  plan_tier: string
  is_active: boolean
  created_at: string
}

export interface ManagedLocation {
  tenant_id: string
  id: string
  name: string
  address: string | null
  is_active: boolean
}

export async function runAdminAction<T>(payload: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Admin management requires a configured Supabase project.')
  const { data, error } = await supabase.functions.invoke('admin-management', { body: payload })
  if (error) {
    let details = error.message
    try {
      const response = error.context as Response | undefined
      const responseBody = response ? await response.json() : null
      if (responseBody && typeof responseBody.error === 'string') details = responseBody.error
    } catch {
      // Preserve the invocation error if no structured response is available.
    }
    throw new Error(details)
  }
  if (data?.error) throw new Error(String(data.error))
  return data as T
}
