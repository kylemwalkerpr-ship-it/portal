import { createClient } from '@supabase/supabase-js'
import { resolveSupabaseKey } from './supabaseKey'

export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    resolveSupabaseKey()!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
