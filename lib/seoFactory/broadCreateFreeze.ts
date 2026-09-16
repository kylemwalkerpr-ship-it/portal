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
 * Existing authoritative destinations keep working:
 *   - exact registry owner URLs / registry hosts (matched row),
 *   - strike-seed existing owners (keep / expand),
 *   - explicit existing cluster `ownerUrlHint` destinations (registry_owner_url),
 *   - any normal refresh / expand / keep flow.
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

/** The minimum OwnerPlan shape the gate needs. */
export type BroadCreatePlan = Pick<OwnerPlan, 'matched' | 'action' | 'routingSource'>

/**
 * Routing sources that already point at an authoritative existing destination
 * (registry owner URL, registry host row, or strike-seed owner). Any routing
 * source NOT listed here is treated as an unowned fallback and stays frozen by
 * default — including future sources (fail-closed).
 */
const AUTHORITATIVE_EXISTING_ROUTING: ReadonlySet<OwnerPlan['routingSource']> = new Set([
  'registry_owner_url',
  'registry_host',
  'strike_seed',
])

/**
 * True when the plan is a genuinely net-new / unowned broad CREATE:
 * no registry owner matched, the action is `build` (not keep/expand), and the
 * destination came from a fallback route rather than an authoritative owner.
 */
export function isBroadNetNewCreate(plan: BroadCreatePlan): boolean {
  if (plan.action !== 'build') return false
  if (plan.matched) return false
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
