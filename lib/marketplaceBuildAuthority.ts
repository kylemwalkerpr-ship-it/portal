/**
 * MARKETPLACE STATIC-BUILD SUPPLY AUTHORITY.
 *
 * Incident this locks down: the GitHub Build step only received the
 * NEXT_PUBLIC Supabase URL + anon key. `public.gigs` is not anon-readable, so
 * every build-time query returned zero rows WITHOUT an error, and the
 * static Marketplace estate was baked false-empty:
 *
 *   · the landing rendered as "no active services";
 *   · subcategory shelves still showed gigs (runtime, service-role Worker);
 *   · `/gigs/<slug>` pages 404ed because `generateStaticParams()` enumerated
 *     zero slugs and the route declares `dynamicParams = false`.
 *
 * The build now receives service-role credentials, and every build-time
 * supply read asserts GENUINE service-role authority before querying. This
 * module centralizes:
 *
 *   · `isMarketplaceProductionBuild()` — `NEXT_PHASE ===
 *     'phase-production-build'`. Only set while Next.js renders the static
 *     estate, so paths shared with the Worker can fail closed at build time
 *     while keeping their existing fail-soft runtime behavior.
 *   · `assertMarketplaceServiceRoleAuthority()` / its build-only variant —
 *     reuses `supabaseAuthMode()` + key classification from
 *     `lib/supabaseKey.ts` and additionally rejects a legacy JWT whose `role`
 *     claim is not `service_role` (e.g. the anon key pasted into
 *     `SUPABASE_SERVICE_ROLE_JWT`).
 *   · `assertMarketplaceEstateNonEmpty()` / its build-only variant — a
 *     positive, non-empty estate assertion for enumerations where zero rows
 *     can only mean the build lost its DB authority.
 *
 * Nothing here weakens RLS: the helpers only refuse to publish an estate
 * that was read through the anon role. Error messages report the auth mode
 * and key FORMAT, never key material.
 */

import {
  classifySupabaseKey,
  isLegacyJwtKey,
  supabaseAuthMode,
  type SupabaseAuthMode,
} from '@/lib/supabaseKey'

/** The phase Next.js sets while it renders the production static estate. */
export const MARKETPLACE_PRODUCTION_BUILD_PHASE = 'phase-production-build'

/** True only while Next.js is generating the production static estate. */
export function isMarketplaceProductionBuild(): boolean {
  return process.env.NEXT_PHASE === MARKETPLACE_PRODUCTION_BUILD_PHASE
}

/**
 * Same key precedence as `lib/supabaseKey.resolveSupabaseKey()`: the first
 * non-blank of `SUPABASE_SERVICE_ROLE_JWT` then `SUPABASE_SERVICE_ROLE_KEY`.
 * Blank counts as absent (GitHub Actions defines unset secrets as empty
 * strings, which must not shadow a usable legacy service-role key).
 */
function configuredServiceRoleKey(): string {
  for (const candidate of [
    process.env.SUPABASE_SERVICE_ROLE_JWT,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ]) {
    if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim()
  }
  return ''
}

/** The auth role the build-time admin client will actually run as. */
export function marketplaceAuthorityMode(): SupabaseAuthMode {
  return supabaseAuthMode()
}

/**
 * `role` claim of the configured legacy service-role JWT when it is a
 * decodable `eyJ…` token, else `null`. Never returns (or logs) key material.
 */
function legacyServiceRoleClaim(): string | null {
  const key = configuredServiceRoleKey()
  if (!isLegacyJwtKey(key)) return null
  const payloadSegment = key.split('.')[1]
  if (!payloadSegment) return null
  try {
    const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const parsed = JSON.parse(atob(padded)) as { role?: unknown }
    return typeof parsed?.role === 'string' ? parsed.role : null
  } catch {
    return null
  }
}

/**
 * Diagnostic suffix for thrown errors: auth mode + key FORMAT only. Useful
 * for operators, safe to log, and never includes a key value.
 */
export function describeMarketplaceBuildAuthority(): string {
  return `authMode=${marketplaceAuthorityMode()} serviceRoleKeyFormat=${classifySupabaseKey(configuredServiceRoleKey())}`
}

/** Message-only error text (never includes env values). */
export function marketplaceErrorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Throw unless the caller can authenticate as service-role. Unconditional:
 * use it from build-only enumeration entry points (`generateStaticParams`)
 * where an anonymous-scoped result is indistinguishable from "no supply".
 */
export function assertMarketplaceServiceRoleAuthority(scope: string): void {
  const mode = marketplaceAuthorityMode()
  if (mode !== 'service-role') {
    throw new Error(
      `[marketplace/build-supply] ${scope} requires genuine service-role DB authority; refusing to bake an anonymous-scoped Marketplace estate (${describeMarketplaceBuildAuthority()}). Provide a legacy eyJ service-role key via SUPABASE_SERVICE_ROLE_JWT (preferred) or SUPABASE_SERVICE_ROLE_KEY for the build.`,
    )
  }
  const role = legacyServiceRoleClaim()
  if (role && role !== 'service_role') {
    throw new Error(
      `[marketplace/build-supply] ${scope} is configured with a key whose JWT role is "${role}", not "service_role"; refusing to bake a Marketplace estate from non-service-role authority.`,
    )
  }
}

/**
 * Build-only variant of the service-role guard for code paths that also run
 * in the Worker: fails the build closed, keeps runtime fail-soft behavior.
 */
export function assertMarketplaceBuildServiceRoleAuthority(scope: string): void {
  if (!isMarketplaceProductionBuild()) return
  assertMarketplaceServiceRoleAuthority(scope)
}

/**
 * Throw unless the enumerated estate is a real, non-empty set. An empty
 * estate after an apparently successful service-role read means the build
 * lost its authority (or the query silently degraded), not that the
 * Marketplace is empty.
 */
export function assertMarketplaceEstateNonEmpty(scope: string, count: number, label: string): void {
  if (!Number.isFinite(count) || count <= 0) {
    throw new Error(
      `[marketplace/build-supply] ${scope} enumerated zero ${label}; refusing to publish an empty Marketplace estate.`,
    )
  }
}

/** Build-only variant of the non-empty estate guard. */
export function assertMarketplaceBuildEstateNonEmpty(scope: string, count: number, label: string): void {
  if (!isMarketplaceProductionBuild()) return
  assertMarketplaceEstateNonEmpty(scope, count, label)
}
