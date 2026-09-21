/**
 * P6 Batch A — apply-authority decision (dependency-light, pure decision).
 *
 * Writes to `seo_interlinks` require GENUINE service-role authority. The
 * repository-wide `resolveSupabaseKey()` deliberately falls back to the legacy
 * anon key for READ paths (the newer `sb_secret_…` service key is rejected by
 * supabase-js v2, and open-RLS tables still read under the anon JWT). A write
 * path must NEVER inherit that fallback: the P6 least-privilege grants make an
 * anon-scoped UPDATE fail with a DB error, and any future grant/RLS change
 * could turn a degraded client into a silent partial success instead.
 *
 * Apply therefore requires BOTH:
 *   1. `supabaseAuthMode() === 'service-role'`, and
 *   2. `resolveSupabaseKey({ allowAnonFallback: false })` returning a usable
 *      legacy `eyJ…` JWT.
 *
 * `decideP6BatchAApplyAuthority` is a pure function over an injected
 * mode/key/classification so tests can pin the decision without any secret;
 * `resolveP6BatchAApplyAuthority` is the env-backed caller the CLI uses.
 * This module never imports Supabase and never creates a client.
 */

import {
  isLegacyJwtKey,
  resolveSupabaseKey,
  supabaseAuthMode,
  type SupabaseAuthMode,
} from '../lib/supabaseKey'

export interface P6BatchAApplyAuthorityInput {
  authMode: SupabaseAuthMode
  /** Result of `resolveSupabaseKey({ allowAnonFallback: false })`. */
  key: string | null | undefined
}

export type P6BatchAApplyAuthorityDecision =
  | { ok: true; key: string }
  | { ok: false; error: string }

/**
 * Pure decision: genuine service-role mode AND a usable legacy service-role
 * JWT, or a refusal. A degraded/anon fallback key is NEVER accepted.
 */
export function decideP6BatchAApplyAuthority(
  input: P6BatchAApplyAuthorityInput,
): P6BatchAApplyAuthorityDecision {
  if (input.authMode !== 'service-role') {
    return {
      ok: false,
      error: `supabaseAuthMode()=${input.authMode} — apply requires service-role; the anon fallback is read-only by contract`,
    }
  }
  const key = typeof input.key === 'string' ? input.key.trim() : ''
  if (!key || !isLegacyJwtKey(key)) {
    return {
      ok: false,
      error:
        'resolveSupabaseKey({ allowAnonFallback: false }) did not return a usable legacy eyJ… service-role JWT',
    }
  }
  return { ok: true, key }
}

/**
 * Env-backed resolution for the CLI. Pass explicit `serviceRoleKey` /
 * `anonKey` overrides (tests) to bypass env reads entirely.
 */
export function resolveP6BatchAApplyAuthority(opts?: {
  serviceRoleKey?: string | null
  anonKey?: string | null
}): P6BatchAApplyAuthorityDecision {
  const key = resolveSupabaseKey({ ...opts, allowAnonFallback: false })
  return decideP6BatchAApplyAuthority({ authMode: supabaseAuthMode(opts), key })
}
