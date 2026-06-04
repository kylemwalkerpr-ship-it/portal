/**
 * Loyalty wallet — pure read-side computation.
 *
 * Rule: for every USD $1000 a student spends (lifetime, across non-refunded /
 * non-cancelled orders), they earn USD $10 of wallet credit. The credit is
 * not auto-issued; admins award up to the available balance at their
 * discretion through wallet.credit() so the wallet_transactions ledger
 * remains the single source of truth.
 *
 * All money in cents end-to-end. Floor math only — never round, never give
 * partial-tier credit. The $1000 threshold is a hard cap.
 *
 * Self-heal: if the `orders` or `wallet_transactions` tables (or columns)
 * aren't provisioned yet, the helpers return zeros + a warning string the
 * caller can surface in the API envelope's `meta.data_warnings`.
 */

import { createSupabaseAdminClient } from './supabase'

/**
 * Permissive Supabase client type so callers may pass either an admin client
 * or the auth-context client returned by requireAdminUser(). We do not depend
 * on the strongly-typed Database generic here — the loyalty calculator only
 * reads `orders` and `wallet_transactions` and self-heals on schema gaps.
 */
type AnySupabase = ReturnType<typeof createSupabaseAdminClient> | any

const SPEND_PER_TIER_CENTS  = 100_000   // $1,000.00
const CREDIT_PER_TIER_CENTS = 1_000     // $10.00

// Orders that DO NOT count toward lifetime spend.
const EXCLUDED_ORDER_STATUSES = ['cancelled', 'refunded']

export type LoyaltyState = {
  lifetime_spent_cents:   number
  earned_credit_cents:    number
  awarded_credit_cents:   number
  available_credit_cents: number
}

export type LoyaltyStateWithWarnings = LoyaltyState & {
  _warnings: string[]
}

const db = () => createSupabaseAdminClient()

const toCents = (numericDollars: unknown): number => {
  const n = Number(numericDollars)
  if (!Number.isFinite(n)) return 0
  // Floor at the cent level — never inflate spend through rounding.
  return Math.floor(n * 100 + 0.5) === Math.round(n * 100)
    ? Math.round(n * 100)
    : Math.floor(n * 100)
}

const earnedFromSpend = (spentCents: number): number => {
  if (spentCents <= 0) return 0
  return Math.floor(spentCents / SPEND_PER_TIER_CENTS) * CREDIT_PER_TIER_CENTS
}

/**
 * Sum non-refunded / non-cancelled order totals for a single profile,
 * returned in cents. Self-heals if the table or columns aren't there yet.
 *
 * Accepts an optional Supabase client so callers (route handlers) can pass
 * their already-authenticated context instead of creating a second admin
 * connection. Defaults to a fresh admin client for the back-compat path.
 */
export async function getLifetimeSpentCents(
  profileId: string,
  client?: AnySupabase
): Promise<{ value: number; warnings: string[] }> {
  const warnings: string[] = []
  const c = client || db()
  try {
    const { data, error } = await c
      .from('orders')
      .select('total_amount, status')
      .eq('client_id', profileId)

    if (error) {
      const msg = String(error.message || '')
      if (/relation .* does not exist/i.test(msg) || /column .* does not exist/i.test(msg)) {
        warnings.push('orders_schema_partial')
        return { value: 0, warnings }
      }
      throw error
    }

    let total = 0
    for (const row of (data ?? []) as Array<{ total_amount: number | string; status: string | null }>) {
      const status = String(row.status || '').toLowerCase()
      if (EXCLUDED_ORDER_STATUSES.includes(status)) continue
      total += toCents(row.total_amount)
    }
    return { value: Math.max(0, total), warnings }
  } catch (e: any) {
    warnings.push(`lifetime_spend_unavailable: ${e?.message || 'unknown'}`)
    return { value: 0, warnings }
  }
}

/**
 * Sum of all loyalty credits already credited to this profile through the
 * wallet ledger (type='adjustment' + metadata.kind='loyalty_credit').
 */
export async function getAwardedLoyaltyCreditCents(
  profileId: string,
  client?: AnySupabase
): Promise<{ value: number; warnings: string[] }> {
  const warnings: string[] = []
  const c = client || db()
  try {
    const { data, error } = await c
      .from('wallet_transactions')
      .select('amount_cents, metadata')
      .eq('profile_id', profileId)
      .eq('type', 'adjustment')

    if (error) {
      const msg = String(error.message || '')
      if (/relation .* does not exist/i.test(msg) || /column .* does not exist/i.test(msg)) {
        warnings.push('wallet_transactions_schema_partial')
        return { value: 0, warnings }
      }
      throw error
    }

    let total = 0
    for (const row of (data ?? []) as Array<{ amount_cents: number; metadata: Record<string, unknown> | null }>) {
      const meta = row.metadata as { kind?: unknown } | null
      if (!meta || meta.kind !== 'loyalty_credit') continue
      const n = Number(row.amount_cents)
      if (!Number.isFinite(n) || n <= 0) continue
      total += Math.floor(n)
    }
    return { value: Math.max(0, total), warnings }
  } catch (e: any) {
    warnings.push(`awarded_credit_unavailable: ${e?.message || 'unknown'}`)
    return { value: 0, warnings }
  }
}

/**
 * Compute the full loyalty state for one profile.
 *
 * available_credit_cents is clamped at zero — if an admin somehow over-issued
 * loyalty credit (e.g. legacy back-fill), we never report a negative balance,
 * just zero. New awards remain bounded by `available_credit_cents` so the
 * over-issue can't cascade.
 */
export async function computeLoyaltyState(profileId: string): Promise<LoyaltyStateWithWarnings>
export async function computeLoyaltyState(client: AnySupabase, profileId: string): Promise<LoyaltyStateWithWarnings>
export async function computeLoyaltyState(
  a: string | AnySupabase,
  b?: string
): Promise<LoyaltyStateWithWarnings> {
  // Overload resolution: single string arg is the back-compat shape; two args
  // is (client, profileId). We do NOT bind to a captured `db()` because the
  // caller's client may carry auth context (e.g. RLS, request id) that the
  // admin client wouldn't.
  let client: AnySupabase | undefined
  let profileId: string
  if (typeof a === 'string') {
    profileId = a
  } else {
    client = a
    profileId = String(b || '')
  }

  if (!profileId) {
    return {
      lifetime_spent_cents:   0,
      earned_credit_cents:    0,
      awarded_credit_cents:   0,
      available_credit_cents: 0,
      _warnings: ['missing_profile_id'],
    }
  }

  const [spend, awarded] = await Promise.all([
    getLifetimeSpentCents(profileId, client),
    getAwardedLoyaltyCreditCents(profileId, client),
  ])

  const lifetime_spent_cents = spend.value
  const earned_credit_cents  = earnedFromSpend(lifetime_spent_cents)
  const awarded_credit_cents = awarded.value
  const available_credit_cents = Math.max(0, earned_credit_cents - awarded_credit_cents)

  return {
    lifetime_spent_cents,
    earned_credit_cents,
    awarded_credit_cents,
    available_credit_cents,
    _warnings: [...spend.warnings, ...awarded.warnings],
  }
}

/**
 * Aggregate across all client profiles. Returns one row per client that
 * has either lifetime spend OR awarded loyalty credit. Tolerant to missing
 * tables — fills with empty arrays + warnings rather than throwing.
 *
 * This is the data source for both:
 *   - GET /api/admin/wallet/loyalty (paginated list)
 *   - The 4 platform-wide metric cards in the admin loyalty UI
 *
 * Implementation note: we do this in JS rather than via a SQL view because
 * Supabase aggregate over `jsonb ->> 'kind'` would otherwise require a
 * dedicated database function and a migration. The volume is bounded
 * (one row per paying student) and this admin endpoint is rarely hit,
 * so the cost is acceptable.
 */
export async function aggregateAllLoyaltyStates(): Promise<{
  rows: Array<{
    profile_id:             string
    lifetime_spent_cents:   number
    earned_credit_cents:    number
    awarded_credit_cents:   number
    available_credit_cents: number
  }>
  warnings: string[]
}> {
  const warnings: string[] = []
  const spendMap   = new Map<string, number>()
  const awardedMap = new Map<string, number>()

  // ── Lifetime spend per client ───────────────────────────────────────────────
  try {
    const { data, error } = await db()
      .from('orders')
      .select('client_id, total_amount, status')
    if (error) {
      const msg = String(error.message || '')
      if (/relation .* does not exist/i.test(msg) || /column .* does not exist/i.test(msg)) {
        warnings.push('orders_schema_partial')
      } else {
        throw error
      }
    } else {
      for (const row of (data ?? []) as Array<{ client_id: string | null; total_amount: number | string; status: string | null }>) {
        if (!row.client_id) continue
        const status = String(row.status || '').toLowerCase()
        if (EXCLUDED_ORDER_STATUSES.includes(status)) continue
        const prev = spendMap.get(row.client_id) || 0
        spendMap.set(row.client_id, prev + toCents(row.total_amount))
      }
    }
  } catch (e: any) {
    warnings.push(`lifetime_spend_unavailable: ${e?.message || 'unknown'}`)
  }

  // ── Awarded loyalty credit per client ───────────────────────────────────────
  try {
    const { data, error } = await db()
      .from('wallet_transactions')
      .select('profile_id, amount_cents, metadata')
      .eq('type', 'adjustment')
    if (error) {
      const msg = String(error.message || '')
      if (/relation .* does not exist/i.test(msg) || /column .* does not exist/i.test(msg)) {
        warnings.push('wallet_transactions_schema_partial')
      } else {
        throw error
      }
    } else {
      for (const row of (data ?? []) as Array<{ profile_id: string; amount_cents: number; metadata: Record<string, unknown> | null }>) {
        const meta = row.metadata as { kind?: unknown } | null
        if (!meta || meta.kind !== 'loyalty_credit') continue
        const n = Number(row.amount_cents)
        if (!Number.isFinite(n) || n <= 0) continue
        const prev = awardedMap.get(row.profile_id) || 0
        awardedMap.set(row.profile_id, prev + Math.floor(n))
      }
    }
  } catch (e: any) {
    warnings.push(`awarded_credit_unavailable: ${e?.message || 'unknown'}`)
  }

  // ── Merge ────────────────────────────────────────────────────────────────────
  const allIds = new Set<string>([...spendMap.keys(), ...awardedMap.keys()])
  const rows = Array.from(allIds).map(profile_id => {
    const lifetime_spent_cents = spendMap.get(profile_id) || 0
    const earned_credit_cents  = earnedFromSpend(lifetime_spent_cents)
    const awarded_credit_cents = awardedMap.get(profile_id) || 0
    const available_credit_cents = Math.max(0, earned_credit_cents - awarded_credit_cents)
    return {
      profile_id,
      lifetime_spent_cents,
      earned_credit_cents,
      awarded_credit_cents,
      available_credit_cents,
    }
  })

  return { rows, warnings }
}

/**
 * Batch variant for the admin list view. Issues exactly two queries — one
 * `orders` scan filtered by `client_id IN (...)`, one `wallet_transactions`
 * scan filtered by `profile_id IN (...)` and `type='adjustment'`. Returns
 * one entry per input id (including zero-filled rows for ids with no
 * activity) so the caller can render a stable grid.
 */
export async function computeLoyaltyStateBatch(
  client: AnySupabase,
  profileIds: string[]
): Promise<{
  rows: Array<{ profile_id: string } & LoyaltyState>
  warnings: string[]
}> {
  const warnings: string[] = []
  const ids = Array.from(new Set((profileIds || []).filter(Boolean)))
  if (ids.length === 0) return { rows: [], warnings }

  const c: AnySupabase = client || db()
  const spendMap   = new Map<string, number>()
  const awardedMap = new Map<string, number>()

  // ── Lifetime spend per client ───────────────────────────────────────────────
  try {
    const { data, error } = await c
      .from('orders')
      .select('client_id, total_amount, status')
      .in('client_id', ids)
    if (error) {
      const msg = String(error.message || '')
      if (/relation .* does not exist/i.test(msg) || /column .* does not exist/i.test(msg)) {
        warnings.push('orders_schema_partial')
      } else {
        throw error
      }
    } else {
      for (const row of (data ?? []) as Array<{ client_id: string | null; total_amount: number | string; status: string | null }>) {
        if (!row.client_id) continue
        const status = String(row.status || '').toLowerCase()
        if (EXCLUDED_ORDER_STATUSES.includes(status)) continue
        spendMap.set(row.client_id, (spendMap.get(row.client_id) || 0) + toCents(row.total_amount))
      }
    }
  } catch (e: any) {
    warnings.push(`lifetime_spend_unavailable: ${e?.message || 'unknown'}`)
  }

  // ── Awarded loyalty credit per profile ──────────────────────────────────────
  try {
    const { data, error } = await c
      .from('wallet_transactions')
      .select('profile_id, amount_cents, metadata')
      .eq('type', 'adjustment')
      .in('profile_id', ids)
    if (error) {
      const msg = String(error.message || '')
      if (/relation .* does not exist/i.test(msg) || /column .* does not exist/i.test(msg)) {
        warnings.push('wallet_transactions_schema_partial')
      } else {
        throw error
      }
    } else {
      for (const row of (data ?? []) as Array<{ profile_id: string; amount_cents: number; metadata: Record<string, unknown> | null }>) {
        const meta = row.metadata as { kind?: unknown } | null
        if (!meta || meta.kind !== 'loyalty_credit') continue
        const n = Number(row.amount_cents)
        if (!Number.isFinite(n) || n <= 0) continue
        awardedMap.set(row.profile_id, (awardedMap.get(row.profile_id) || 0) + Math.floor(n))
      }
    }
  } catch (e: any) {
    warnings.push(`awarded_credit_unavailable: ${e?.message || 'unknown'}`)
  }

  const rows = ids.map(profile_id => {
    const lifetime_spent_cents = spendMap.get(profile_id) || 0
    const earned_credit_cents  = earnedFromSpend(lifetime_spent_cents)
    const awarded_credit_cents = awardedMap.get(profile_id) || 0
    const available_credit_cents = Math.max(0, earned_credit_cents - awarded_credit_cents)
    return {
      profile_id,
      lifetime_spent_cents,
      earned_credit_cents,
      awarded_credit_cents,
      available_credit_cents,
    }
  })

  return { rows, warnings }
}

/**
 * Pure helper exported for unit-testability. Given a lifetime spend total in
 * cents, returns the total loyalty credit earned in cents.
 */
export const loyaltyEarnedFromSpendCents = earnedFromSpend
