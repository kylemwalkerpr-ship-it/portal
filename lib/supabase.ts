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
 * Per-isolate shared service-role admin client.
 *
 * Why this is safe to reuse across requests in a Worker isolate:
 *  - `autoRefreshToken: false` and `persistSession: false` mean the client holds
 *    NO auth/session state and never mutates it — there is no GoTrue session to
 *    leak between requests.
 *  - The key material comes exclusively from server env vars (never from a
 *    request), and the cache is keyed on that material, so a key rotation
 *    produces a fresh client on the next call instead of pinning a stale one.
 *  - supabase-js query builders are created per-call via `.from(...)`, so no
 *    request-scoped query state is shared.
 *
 * Why it exists: `createSupabaseAdminClient()` was being invoked per request on
 * the hottest authenticated paths (requirePortalUser, model-calibration,
 * loadVisibilityFeed and friends), paying supabase-js client construction CPU
 * every time on a Worker already brushing the exceededCpu/1102 ceiling. Cache
 * invalidation is deliberately conservative: any change to the resolved key
 * string, the URL, or the auth mode discards the cached instance.
 */
let cachedAdmin: {
  url: string
  key: string
  mode: string
  client: ReturnType<typeof createSupabaseAdminClient>
} | null = null

export function getSupabaseAdminClient(): ReturnType<typeof createSupabaseAdminClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = resolveSupabaseKey() ?? ''
  const mode = supabaseAuthMode()
  if (cachedAdmin && cachedAdmin.url === url && cachedAdmin.key === key && cachedAdmin.mode === mode) {
    return cachedAdmin.client
  }
  const client = createSupabaseAdminClient()
  cachedAdmin = { url, key, mode, client }
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
