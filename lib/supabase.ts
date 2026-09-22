import { createClient } from '@supabase/supabase-js'
import { resolveSupabaseKey, supabaseAuthMode } from './supabaseKey'

function createAdminClient(url: string, key: string) {
  return createClient(
    url,
    key,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

type CachedAdminClient = {
  url: string
  key: string
  client: ReturnType<typeof createAdminClient>
}

let cachedAdminClient: CachedAdminClient | null = null

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = resolveSupabaseKey()!

  if (cachedAdminClient?.url === url && cachedAdminClient.key === key) {
    return cachedAdminClient.client
  }

  const client = createAdminClient(url, key)
  cachedAdminClient = { url, key, client }
  return client
}
/**
 * True when the deployed service-role key is usable by supabase-js v2
 * (legacy JWT). When false, every "admin" client actually runs as the anon
 * key against open-RLS tables — surface this in status endpoints.
 */
export function isServiceRoleAchieved(): boolean {
  return supabaseAuthMode() === 'service-role'
}
