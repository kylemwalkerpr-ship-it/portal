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
 * Prefers, in order:
 *   1. `SUPABASE_SERVICE_ROLE_JWT` — an explicitly-provided legacy `eyJ…`
 *      service-role JWT. Set this alongside a new-format
 *      `SUPABASE_SERVICE_ROLE_KEY` to keep full service-role access (no RLS
 *      bypass via the anon key).
 *   2. a legacy `eyJ…` `SUPABASE_SERVICE_ROLE_KEY`
 *   3. the anon key — **only** as a last resort, and only when the caller
 *      opts in via `allowAnonFallback`. Anonymous fallback means every
 *      "admin" DB call runs as the PUBLIC anon role against open-RLS tables,
 *      which is a security and data-integrity risk — never do it silently.
 *      The long-standing default in this repo used to fall back to anon
 *      automatically; keep that behavior by passing `{ allowAnonFallback:
 *      true }` in call sites that are knowingly read-only/best-effort.
 *
 * Pass explicit `serviceRoleKey` / `anonKey` to override the env reads (used
 * by tests). Returns null when nothing usable is present so callers can raise
 * their own "missing env" error.
 */
export type SupabaseAuthMode = 'service-role' | 'degraded-anon' | 'missing'

export function resolveSupabaseKey(opts?: {
  serviceRoleKey?: string | null
  anonKey?: string | null
  allowAnonFallback?: boolean
}): string | null {
  const sr =
    opts?.serviceRoleKey ??
    process.env.SUPABASE_SERVICE_ROLE_JWT ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    ''
  const anon = opts?.anonKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

  if (isLegacyJwtKey(sr)) return sr

  if (isLegacyJwtKey(anon)) {
    if (opts?.allowAnonFallback === false) return null
    if (sr) {
      // Service-role key present but unusable (new `sb_secret_…` format).
      console.warn(
        '[supabaseKey] SUPABASE_SERVICE_ROLE_KEY is in the new sb_secret_ format which supabase-js v2 rejects — falling back to the ANON key. Set SUPABASE_SERVICE_ROLE_JWT (legacy service-role JWT) to restore service-role access; anonymous fallback exposes open-RLS tables.',
      )
    }
    return anon
  }

  // Last resort: return whatever we have (even a secret-format key) so the
  // caller surfaces the real supabase-js error instead of a bare undefined.
  return sr || anon || null
}

/**
 * Which auth role is `resolveSupabaseKey()` going to hand out? Lets callers
 * surface degraded auth in status endpoints instead of silently serving
 * anonymous-scope data.
 */
export function supabaseAuthMode(opts?: {
  serviceRoleKey?: string | null
  anonKey?: string | null
}): SupabaseAuthMode {
  const sr =
    opts?.serviceRoleKey ??
    process.env.SUPABASE_SERVICE_ROLE_JWT ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    ''
  const anon = opts?.anonKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  if (isLegacyJwtKey(sr)) return 'service-role'
  if (isLegacyJwtKey(anon)) return 'degraded-anon'
  return sr || anon ? 'degraded-anon' : 'missing'
}
