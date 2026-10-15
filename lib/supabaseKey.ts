/**
 * SUPABASE KEY FORMAT DETECTION — works with either key format.
 *
 * Supabase issues API keys in two formats:
 *   · legacy JWT  — `eyJ…` (the classic `service_role` / `anon` JWTs)
 *   · new secret  — `sb_secret_…` (the newer dashboard-issued format)
 *
 * The installed `@supabase/supabase-js` version supports both formats. A
 * secret API key is a server-side service-role credential. Keep it as
 * service-role authority instead of silently downgrading admin reads to the
 * public anon key.
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

/** True when the key is in the legacy JWT format. */
export function isLegacyJwtKey(key: string | null | undefined): boolean {
  return classifySupabaseKey(key) === 'legacy-jwt'
}

/** True when the key is a modern secret API key. */
export function isSecretKey(key: string | null | undefined): boolean {
  return classifySupabaseKey(key) === 'secret'
}

/**
 * Pick the best key a supabase-js v2 client can actually use.
 *
 * Prefers, in order:
 *   1. A modern `sb_secret_…` value in `SUPABASE_SERVICE_ROLE_KEY`, so it
 *      takes precedence during migration while a legacy key remains set.
 *   2. `SUPABASE_SERVICE_ROLE_JWT` — an explicitly-provided legacy JWT.
 *   3. a legacy JWT in `SUPABASE_SERVICE_ROLE_KEY`.
 *   4. the anon key — **only** as a last resort, and only when the caller
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

/**
 * Read the first non-blank env var. GitHub Actions defines an *empty string*
 * for every secret that is not configured in the repository, and plain `??`
 * would then let an empty `SUPABASE_SERVICE_ROLE_JWT` shadow a perfectly
 * usable legacy `SUPABASE_SERVICE_ROLE_KEY` (silently falling back to the
 * anon key). Blank therefore counts as absent, and precedence is decided by
 * usable values only.
 */
function envNonEmpty(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return ''
}

function configuredServiceRoleKey(): string {
  const apiKey = envNonEmpty('SUPABASE_SERVICE_ROLE_KEY')
  if (isSecretKey(apiKey)) return apiKey
  return envNonEmpty('SUPABASE_SERVICE_ROLE_JWT', 'SUPABASE_SERVICE_ROLE_KEY')
}

export function resolveSupabaseKey(opts?: {
  serviceRoleKey?: string | null
  anonKey?: string | null
  allowAnonFallback?: boolean
}): string | null {
  const sr =
    opts?.serviceRoleKey ??
    configuredServiceRoleKey()
  const anon = opts?.anonKey ?? envNonEmpty('NEXT_PUBLIC_SUPABASE_ANON_KEY')

  if (isLegacyJwtKey(sr) || isSecretKey(sr)) return sr

  if (isLegacyJwtKey(anon)) {
    if (opts?.allowAnonFallback === false) return null
    if (sr) {
      // A configured but unrecognized server key cannot establish service-role authority.
      console.warn(
        '[supabaseKey] Configured Supabase service-role key format is unrecognized; falling back to the ANON key. Anonymous fallback exposes open-RLS tables.',
      )
    }
    return anon
  }

  // Last resort: return whatever we have (even an unrecognized key) so the
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
    configuredServiceRoleKey()
  const anon = opts?.anonKey ?? envNonEmpty('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  if (isLegacyJwtKey(sr) || isSecretKey(sr)) return 'service-role'
  if (isLegacyJwtKey(anon)) return 'degraded-anon'
  return sr || anon ? 'degraded-anon' : 'missing'
}
