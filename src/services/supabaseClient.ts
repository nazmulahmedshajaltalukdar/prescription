// src/services/supabaseClient.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

function isAllowedSupabaseUrl(value: string) {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    )
  } catch {
    return false
  }
}

export function getSupabaseConfigError() {
  if (!supabaseUrl && !supabaseAnonKey) return null
  if (!supabaseUrl) return 'VITE_SUPABASE_URL is missing.'
  if (!supabaseAnonKey) return 'VITE_SUPABASE_ANON_KEY is missing.'
  if (!isAllowedSupabaseUrl(supabaseUrl)) return 'VITE_SUPABASE_URL must use HTTPS, except for localhost development.'
  return null
}

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey) && !getSupabaseConfigError()
}

export function hasSupabaseConfiguration() {
  return Boolean(supabaseUrl || supabaseAnonKey)
}

export const supabase = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true },
    })
  : null
