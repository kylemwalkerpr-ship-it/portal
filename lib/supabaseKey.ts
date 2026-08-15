/**
 * SUPABASE KEY FORMAT DETECTION — works with either key format.
 *
 * Supabase issues API keys in two formats:
 *   · legacy JWT  — `eyJ…` (the classic `service_role` / `anon` JWTs)
 *   · new secret  — `sb_secret_…` (the newer dashboard-issued format)
 *
 * `@supabase/supabase-js` v2 only accepts the legacy `eyJ…` JWT; it rejects
 * the `sb_secret_…` format with "Unregistered API key" because PostgREST on
 * the project isn't provisioned for it. So a local `.env.local` that carries
 * the new-format service key breaks every server-side read unless the code
 * detects the format and falls back to the legacy anon key (which is still an
 * `eyJ…` JWT and works against open-RLS tables such as `content_jobs`).
 *
 * This module centralizes that detection + the safe fallback so call sites
 * don't each re-derive `key.startsWith('eyJ')` ad hoc.
 */

export type SupabaseKeyFormat = 'legacy-jwt' | 'secret' | 'missing' | 'unknown'

/** Classify a Supabase key by its observable prefix. */
export function classifySupabaseKey(key: string | null | undefined): SupabaseKeyFormat {
  const k = (key ?? '').trim()
  if (!k) return 'missing'
  if (k.startsWith('eyJ')) return 'legacy-jwt'
  if (k.startsWith('sb_secret_')) return 'secret'
  return 'unknown'
}

/** True when the key is the legacy `eyJ…` JWT format supabase-js v2 accepts. */
export function isLegacyJwtKey(key: string | null | undefined): boolean {
  return classifySupabaseKey(key) === 'legacy-jwt'
}

/** True when the key is the new `sb_secret_…` format supabase-js v2 rejects. */
export function isSecretKey(key: string | null | undefined): boolean {
  return classifySupabaseKey(key) === 'secret'
}

/**
 * Pick the best key a supabase-js v2 client can actually use.
 *
 * Prefers the legacy `eyJ…` service-role JWT (full access, no RLS). When the
 * service-role key is the new `sb_secret_…` format (rejected by supabase-js
 * v2), falls back to the anon key — a legacy JWT that reads/writes open-RLS
 * tables (e.g. `content_jobs` is `USING true / WITH CHECK true`). This mirrors
 * the long-standing pattern in the scripts/*.mts one-shots.
 *
 * Pass explicit `serviceRoleKey` / `anonKey` to override the env reads (used
 * by tests). Returns null when nothing usable is present so callers can raise
 * their own "missing env" error.
 */
export function resolveSupabaseKey(opts?: {
  serviceRoleKey?: string | null
  anonKey?: string | null
}): string | null {
  const sr = opts?.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const anon = opts?.anonKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

  if (isLegacyJwtKey(sr)) return sr
  if (isLegacyJwtKey(anon)) return anon

  // Last resort: return whatever we have (even a secret-format key) so the
  // caller surfaces the real supabase-js error instead of a bare undefined.
  return sr || anon || null
}
