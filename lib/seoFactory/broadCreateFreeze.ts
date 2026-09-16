/**
 * P0 broad-CREATE freeze — execution gate at the central SEO Factory boundary.
 *
 * Cleanup-to-expansion parity is not yet proven (P13 controlled expansion is
 * still PENDING), so an unmatched keyword routed by standing rules or a
 * content-type default must not become permission to author and ship a
 * net-new public page. This is an EXECUTION rule, not a routing rewrite:
 * `resolveOwner` keeps emitting standing_rules plans unchanged, and the
 * manual ownership-routing contract is untouched.
 *
 * The gate classifies the FINAL DESTINATION, not the keyword match: a keyword
 * may match an existing Legal registry row while `resolveOwner` intentionally
 * routes an explicit non-Legal destination to a different, net-new URL
 * (stealLegalPillar). There `matched` is non-null but the destination is still
 * unowned, so it stays frozen. The same applies to `registry_host`, which is
 * emitted only when a matched row's `owner_url` cannot be parsed and
 * `resolveOwner` invents a fallback path — a fabricated destination, not an
 * existing owner, so `expand` / `keep` labels on it are not proof either.
 *
 * Existing authoritative destinations keep working:
 *   - exact registry owner URLs / explicit cluster `ownerUrlHint` destinations
 *     (registry_owner_url),
 *   - strike-seed existing owners (keep / expand).
 *
 * Future P13 unlock: set `SEO_FACTORY_UNLOCK_BROAD_CREATE=1` (or `true`) once
 * the cleanup-to-expansion parity gates are proven. The default is frozen and
 * the flag is never inferred from unrelated environment variables.
 *
 * Deliberately dependency-light (type-only import) so tests and callers do not
 * load the ownership registry or the AI stack to evaluate the gate.
 */

import type { OwnerPlan } from './ownership'

export const BROAD_CREATE_UNLOCK_ENV = 'SEO_FACTORY_UNLOCK_BROAD_CREATE'

/**
 * The OwnerPlan fields accepted by the gate. `matched` and `action` are
 * accepted for call-site compatibility but deliberately NOT consulted: a
 * keyword match or an `expand` / `keep` label is not proof that the final
 * destination exists.
 */
export type BroadCreatePlan = Pick<OwnerPlan, 'matched' | 'action' | 'routingSource'>

/**
 * Routing sources that prove the FINAL DESTINATION already exists:
 *   - `registry_owner_url`: a matched row with a usable owner URL (or an
 *     explicit cluster `ownerUrlHint` naming an existing canonical),
 *   - `strike_seed`: a locked existing GSC seed page.
 *
 * `registry_host` is deliberately NOT here: it is emitted only when the
 * matched row's `owner_url` is unusable and `resolveOwner` invents a fallback
 * path, so it is an unowned fallback despite carrying a keyword match. Any
 * routing source NOT listed here is treated as an unowned fallback and stays
 * frozen by default — including future sources (fail-closed).
 */
const AUTHORITATIVE_EXISTING_ROUTING: ReadonlySet<OwnerPlan['routingSource']> = new Set([
  'registry_owner_url',
  'strike_seed',
])

/**
 * True when the plan's FINAL DESTINATION is not proven to already exist. The
 * action label is deliberately NOT consulted: `resolveOwner` can carry an
 * `expand` / `keep` action on a fallback route (e.g. `registry_host` after an
 * unusable owner URL) while still inventing a net-new URL, so only
 * authoritative routing proves an existing owner.
 *
 * A non-null `matched` row is NOT proof either: `resolveOwner` can match a
 * registry keyword yet deliberately route an explicit non-legal destination to
 * a different, net-new standing-rules URL (stealLegalPillar). There `matched`
 * describes the keyword match, not the final destination.
 */
export function isBroadNetNewCreate(plan: BroadCreatePlan): boolean {
  return !AUTHORITATIVE_EXISTING_ROUTING.has(plan.routingSource)
}

function envValue(env: Record<string, string | undefined>, key: string): string {
  const raw = env[key]
  return raw == null ? '' : String(raw).trim().toLowerCase()
}

/**
 * The one intentional P13 unlock. Only `1` / `true` unlock; everything else
 * (including missing, `0`, `false`, unrelated env vars) stays frozen.
 */
export function isBroadCreateUnlocked(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): boolean {
  const value = envValue(env, BROAD_CREATE_UNLOCK_ENV)
  return value === '1' || value === 'true'
}

/** Deterministic, operator-readable refusal message. */
export function broadCreateFreezeMessage(
  plan: BroadCreatePlan,
  opts: { primaryKeyword?: string } = {},
): string {
  const keyword = opts.primaryKeyword ? `"${opts.primaryKeyword}" ` : ''
  const canonical = (plan as { canonicalUrl?: string }).canonicalUrl
  const filePath = (plan as { filePath?: string }).filePath
  const destination = [canonical, filePath].filter(Boolean).join(' · ')
  return [
    'Broad net-new CREATE is frozen pending cleanup-to-expansion parity (P13 controlled expansion not yet started).',
    `Refused plan for ${keyword}(action=${plan.action}, routingSource=${plan.routingSource})${destination ? ` → ${destination}` : ''}.`,
    'That routing source does not prove the final destination already exists — an action label alone is not an existing owner.',
    'No drafting job was created and no AI generation was started.',
    'Resolve this keyword to an existing owner (exact registry owner URL, strike-seed owner, or explicit cluster ownerUrlHint), or deliberately unlock '
      + `${BROAD_CREATE_UNLOCK_ENV}=1 once the P13 expansion gates are proven.`,
  ].join(' ')
}

/**
 * Execution gate — call immediately after `resolveOwner()` and before any AI
 * generation or drafting-job persistence. Throws for broad net-new CREATE
 * unless the explicit P13 unlock is configured.
 */
export function assertBroadCreateAllowed(
  plan: BroadCreatePlan,
  opts: {
    primaryKeyword?: string
    env?: Record<string, string | undefined>
  } = {},
): void {
  if (!isBroadNetNewCreate(plan)) return
  if (isBroadCreateUnlocked(opts.env)) return
  throw new Error(broadCreateFreezeMessage(plan, { primaryKeyword: opts.primaryKeyword }))
}
