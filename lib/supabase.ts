import { createClient } from '@supabase/supabase-js'
import { resolveSupabaseKey, supabaseAuthMode } from './supabaseKey'

function hasServiceRoleJwtClaim(key: string): boolean {
  if (!key.startsWith('eyJ')) return false
  const parts = key.split('.')
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return false

  try {
    const decode = (part: string) => {
      const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
      return JSON.parse(new TextDecoder().decode(bytes))
    }
    const header = decode(parts[0]) as { alg?: unknown } | null
    const claims = decode(parts[1]) as { role?: unknown } | null
    return Boolean(
      header && typeof header === 'object' && typeof header.alg === 'string' &&
      header.alg.length > 0 && header.alg !== 'none' &&
      claims && typeof claims === 'object' && claims.role === 'service_role',
    )
  } catch {
    return false
  }
}

/**
 * Resolve only the supported legacy service-role JWT credential path.
 * The general admin client below intentionally retains its historical anon
 * fallback; privileged gate/feed tables must never use that degraded client.
 */
export function resolveSupabaseServiceRoleJwt(): string | null {
  return [process.env.SUPABASE_SERVICE_ROLE_JWT, process.env.SUPABASE_SERVICE_ROLE_KEY]
    .map((candidate) => typeof candidate === 'string' ? candidate.trim() : '')
    .find((candidate) => candidate !== '' && hasServiceRoleJwtClaim(candidate)) || null
}

/** Create a client only when a configured credential claims service_role. */
export function createSupabaseServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || ''
  const key = resolveSupabaseServiceRoleJwt()
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

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
