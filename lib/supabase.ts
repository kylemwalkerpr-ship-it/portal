import { createClient } from '@supabase/supabase-js'
import { resolveSupabaseKey, supabaseAuthMode } from './supabaseKey'

export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    resolveSupabaseKey()!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * True when the deployed service-role key is usable by supabase-js v2
 * (legacy JWT). When false, every "admin" client actually runs as the anon
 * key against open-RLS tables — surface this in status endpoints.
 */
export function isServiceRoleAchieved(): boolean {
  return supabaseAuthMode() === 'service-role'
}
