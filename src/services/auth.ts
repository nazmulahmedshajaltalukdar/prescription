import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getEffectiveScope, UserRole } from './tenant'
import { getPlanForSeatCount, planOrder, PlanTier } from './tenantPlans'
import { getSupabaseConfigError, hasSupabaseConfiguration, isSupabaseConfigured, supabase } from './supabaseClient'
import { readJson, writeJson } from './storage'

export type AuthRole = UserRole

export interface AuthUser {
  id: string
  email: string
  full_name: string
  role: AuthRole
  tenant_id: string
  sub_tenant_id?: string
  plan_tier: PlanTier
  tenant_modules?: Record<string, boolean>
  scope: {
    tenantId: string
    subTenantId?: string
    canReadAllTenants: boolean
    canWriteAllSubTenants: boolean
  }
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<AuthUser>
  signUpClinic: (input: { fullName: string; email: string; password: string; clinicName: string }) => Promise<boolean>
  updateFullName: (fullName: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  setPassword: (password: string) => Promise<void>
  signOut: () => Promise<void>
}

const STORAGE_KEY = 'clinic-demo-user'
const DEFAULT_TENANT_ID = 'tenant-demo'
const DEFAULT_SUB_TENANT_ID = 'clinic-demo'
const DEFAULT_PLAN_TIER: PlanTier = 'starter_5'
const AuthContext = createContext<AuthContextValue | null>(null)
const AUTH_ROLES: AuthRole[] = ['platform_owner', 'tenant_owner', 'tenant_admin', 'doctor', 'pharmacist', 'nurse', 'receptionist']

function isAuthRole(role: string): role is AuthRole {
  return AUTH_ROLES.includes(role as AuthRole)
}

function isPlanTier(planTier: string): planTier is PlanTier {
  return planOrder.includes(planTier as PlanTier)
}

function buildAuthUserSession(
  partial: Omit<AuthUser, 'scope'> & { tenant_id?: string; sub_tenant_id?: string; plan_tier?: PlanTier },
): AuthUser {
  const tenantId = partial.tenant_id || DEFAULT_TENANT_ID
  const subTenantId = partial.sub_tenant_id || DEFAULT_SUB_TENANT_ID
  const planTier = partial.plan_tier || getPlanForSeatCount(5).tier
  const scope = getEffectiveScope({ role: partial.role, tenantId, subTenantId })

  return {
    ...partial,
    tenant_id: tenantId,
    sub_tenant_id: subTenantId,
    plan_tier: planTier,
    scope,
  }
}

async function fetchSupabaseUserProfile(user?: User | null): Promise<AuthUser | null> {
  if (!isSupabaseConfigured() || !supabase) {
    return null
  }

  let sessionUser = user
  if (!sessionUser) {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    sessionUser = data.session?.user ?? null
  }

  if (!sessionUser) {
    return null
  }

  const { data: profileData, error } = await supabase
    .from('profiles')
    .select('full_name, role, tenant_id, sub_tenant_id, plan_tier, is_active')
    .eq('id', sessionUser.id)
    .maybeSingle()

  if (error) throw error
  if (!profileData) {
    throw new Error('Your account does not have a clinic profile yet. Contact your clinic administrator.')
  }
  if (profileData.is_active === false) {
    throw new Error('Your clinic account is inactive. Contact your clinic administrator.')
  }
  if (!isAuthRole(profileData.role)) {
    throw new Error('Your clinic profile has an unsupported role. Contact your clinic administrator.')
  }
  if (!isPlanTier(profileData.plan_tier)) {
    throw new Error('Your clinic profile has an unsupported plan. Contact your clinic administrator.')
  }

  let tenantModules: Record<string, boolean> = {}
  if (profileData.role !== 'platform_owner') {
    const { data: tenantData, error: tenantError } = await supabase
      .from('tenants')
      .select('status, modules')
      .eq('id', profileData.tenant_id)
      .maybeSingle()
    if (tenantError) throw tenantError
    if (!tenantData) throw new Error('Your clinic workspace is not configured. Contact your platform administrator.')
    if (tenantData.status !== 'active') {
      throw new Error('This clinic workspace is suspended. Contact your platform administrator.')
    }
    tenantModules = tenantData.modules || {}
  }

  return buildAuthUserSession({
    id: sessionUser.id,
    email: sessionUser.email || '',
    full_name: profileData.full_name || sessionUser.user_metadata?.full_name || sessionUser.email?.split('@')[0] || 'Clinician',
    role: profileData.role,
    tenant_id: profileData.tenant_id,
    sub_tenant_id: profileData.sub_tenant_id,
    plan_tier: profileData.plan_tier,
    tenant_modules: tenantModules,
  })
}

export function createDemoUser(email: string, fullName?: string, tenantId = DEFAULT_TENANT_ID, subTenantId = DEFAULT_SUB_TENANT_ID): AuthUser {
  const normalizedEmail = email.trim().toLowerCase()
  const name = (fullName || normalizedEmail.split('@')[0] || 'Clinician').trim()

  return buildAuthUserSession({
    id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    email: normalizedEmail,
    full_name: name,
    role: 'doctor',
    tenant_id: tenantId,
    sub_tenant_id: subTenantId,
    plan_tier: DEFAULT_PLAN_TIER,
    tenant_modules: {
      inventory: true,
      pharmacy: false,
      billing: false,
      labs: false,
      ai: false,
    },
  })
}

export function readStoredUser(): AuthUser | null {
  const storedUser = readJson<AuthUser | null>(STORAGE_KEY, null)

  if (!storedUser) {
    return null
  }

  return buildAuthUserSession({
    ...storedUser,
    tenant_id: storedUser.tenant_id || DEFAULT_TENANT_ID,
    sub_tenant_id: storedUser.sub_tenant_id || DEFAULT_SUB_TENANT_ID,
    plan_tier: storedUser.plan_tier || DEFAULT_PLAN_TIER,
  })
}

export function writeStoredUser(user: AuthUser) {
  writeJson(STORAGE_KEY, user)
}

export function clearStoredUser() {
  const storage = typeof window !== 'undefined' ? window.localStorage : null
  storage?.removeItem(STORAGE_KEY)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const hydrate = async () => {
      try {
        const configError = getSupabaseConfigError()
        if (configError) throw new Error(configError)

        if (isSupabaseConfigured() && supabase) {
          const nextUser = await fetchSupabaseUserProfile()
          if (nextUser) writeStoredUser(nextUser)
          else clearStoredUser()
          setUser(nextUser)
          return
        }

        setUser(hasSupabaseConfiguration() ? null : readStoredUser())
      } catch (error) {
        console.error('Unable to load the signed-in clinic profile', error)
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    hydrate()
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) {
      return
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        clearStoredUser()
        setUser(null)
        return
      }

      queueMicrotask(() => {
        void fetchSupabaseUserProfile(session.user)
          .then((nextUser) => {
            if (nextUser) {
              writeStoredUser(nextUser)
              setUser(nextUser)
            }
          })
          .catch((error) => console.error('Unable to load the authenticated clinic profile', error))
      })
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email: string, password: string): Promise<AuthUser> => {
    const normalizedEmail = email.trim().toLowerCase()

    if (!normalizedEmail || !password.trim()) {
      throw new Error('Email and password are required.')
    }

    const configError = getSupabaseConfigError()
    if (configError) throw new Error(configError)

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: password.trim(),
      })

      if (error) {
        throw new Error(error.message)
      }

      const nextUser = await fetchSupabaseUserProfile(data.user)
      if (!nextUser) throw new Error('Unable to load the clinic profile for this account.')

      writeStoredUser(nextUser)
      setUser(nextUser)
      return nextUser
    }

    const nextUser = createDemoUser(normalizedEmail, normalizedEmail.split('@')[0], DEFAULT_TENANT_ID, DEFAULT_SUB_TENANT_ID)
    writeStoredUser(nextUser)
    setUser(nextUser)
    return nextUser
  }

  const signUpClinic = async ({ fullName, email, password, clinicName }: {
    fullName: string
    email: string
    password: string
    clinicName: string
  }): Promise<boolean> => {
    const normalizedName = fullName.trim()
    const normalizedEmail = email.trim().toLowerCase()
    const normalizedClinicName = clinicName.trim()
    if (!normalizedName || !normalizedClinicName || !normalizedEmail || !password) {
      throw new Error('Name, email, clinic name, and password are required.')
    }
    if (normalizedName.length > 120 || normalizedClinicName.length > 120) {
      throw new Error('Name and clinic name must be 120 characters or fewer.')
    }
    if (password.length < 8) throw new Error('Password must be at least 8 characters.')

    const configError = getSupabaseConfigError()
    if (configError) throw new Error(configError)
    if (!isSupabaseConfigured() || !supabase) {
      throw new Error('Clinic registration requires a configured Supabase project.')
    }

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login?verified=1`,
        data: {
          signup_type: 'clinic_owner_signup',
          full_name: normalizedName,
          clinic_name: normalizedClinicName,
        },
      },
    })
    if (error) throw new Error(error.message)
    if (data.session) {
      const nextUser = await fetchSupabaseUserProfile(data.user)
      if (!nextUser) throw new Error('Unable to load the new clinic account.')
      writeStoredUser(nextUser)
      setUser(nextUser)
      return true
    }
    return false
  }

  const updateFullName = async (fullName: string) => {
    const normalizedName = fullName.trim()
    if (!normalizedName) throw new Error('Full name is required.')
    if (!user) throw new Error('Sign in before updating your profile.')

    if (isSupabaseConfigured() && supabase) {
      const { error: authError } = await supabase.auth.updateUser({ data: { full_name: normalizedName } })
      if (authError) throw new Error(authError.message)

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ full_name: normalizedName })
        .eq('id', user.id)
      if (profileError) throw new Error(profileError.message)
    }

    const nextUser = { ...user, full_name: normalizedName }
    writeStoredUser(nextUser)
    setUser(nextUser)
  }

  const updatePassword = async (password: string) => {
    if (password.length < 8) throw new Error('Password must be at least 8 characters.')
    if (!user) throw new Error('Sign in before updating your password.')
    if (!isSupabaseConfigured() || !supabase) {
      throw new Error('Password changes require a configured Supabase account.')
    }

    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw new Error(error.message)
  }

  const requestPasswordReset = async (email: string) => {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) throw new Error('Email is required.')

    const configError = getSupabaseConfigError()
    if (configError) throw new Error(configError)
    if (!isSupabaseConfigured() || !supabase) {
      throw new Error('Password recovery is only available when Supabase is configured.')
    }

    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/set-password`,
    })
    if (error) throw new Error(error.message)
  }

  const setPassword = async (password: string) => {
    if (password.length < 8) throw new Error('Password must be at least 8 characters.')

    const configError = getSupabaseConfigError()
    if (configError) throw new Error(configError)
    if (!isSupabaseConfigured() || !supabase) {
      throw new Error('Account setup is only available when Supabase is configured.')
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) throw new Error(sessionError.message)
    if (!sessionData.session) {
      throw new Error('Open a valid invitation or password reset link before setting a password.')
    }

    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw new Error(error.message)
  }

  const signOut = async () => {
    if (isSupabaseConfigured() && supabase) {
      await supabase.auth.signOut()
    }

    clearStoredUser()
    setUser(null)
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      signIn,
      signUpClinic,
      updateFullName,
      updatePassword,
      requestPasswordReset,
      setPassword,
      signOut,
    }),
    [user, loading],
  )

  return React.createElement(AuthContext.Provider, { value }, children)
}

export function useAuth() {
  const ctx = useContext(AuthContext)

  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return ctx
}
