/**
 * GET  /api/admin/wallet/loyalty/[profileId]
 *      Detail: lifetime spend + earned/awarded/available + ledger history.
 *
 * POST /api/admin/wallet/loyalty/[profileId]
 *      Award N cents of loyalty credit (N <= available_credit_cents).
 *      Body: { amount_cents: integer > 0, reason: string }
 *      Goes through wallet.credit() with
 *        metadata: { kind: 'loyalty_credit', awarded_by: <admin profile id> }
 *      so the wallet_transactions ledger stays canonical.
 */
import { requireAdminUser } from '@/lib/portalAuth'
import { ok, fail } from '@/lib/apiEnvelope'
import { computeLoyaltyState } from '@/lib/loyaltyWallet'
import { credit, getOrCreateWallet } from '@/lib/wallet'

async function loadHistory(db: any, profileId: string, warnings: string[]) {
  try {
    const { data, error } = await db
      .from('wallet_transactions')
      .select('id, type, amount_cents, signed_cents, balance_after_cents, description, reference, metadata, created_at')
      .eq('profile_id', profileId)
      .eq('type', 'adjustment')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) {
      const msg = String(error.message || '')
      if (/relation .* does not exist/i.test(msg) || /column .* does not exist/i.test(msg)) {
        warnings.push('wallet_transactions_schema_partial')
        return []
      }
      warnings.push(`history_unavailable: ${error.message}`)
      return []
    }
    return ((data ?? []) as Array<any>).filter(r => {
      const meta = r.metadata as { kind?: unknown } | null
      return meta && meta.kind === 'loyalty_credit'
    })
  } catch (e: any) {
    warnings.push(`history_unavailable: ${e?.message || 'unknown'}`)
    return []
  }
}

async function loadProfile(db: any, profileId: string) {
  const { data, error } = await db
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('id', profileId)
    .single()
  if (error || !data) return null
  return data as { id: string; full_name: string | null; email: string | null; role: string | null }
}

export async function GET(_req: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { profileId } = await params
  if (!profileId) return fail('profileId is required.', 400)

  const profile = await loadProfile(auth.db, profileId)
  if (!profile) return fail('Profile not found.', 404)

  const state = await computeLoyaltyState(profileId)
  const warnings = [...state._warnings]
  const history = await loadHistory(auth.db, profileId, warnings)

  // Strip the internal warnings field before returning state to the client.
  const { _warnings, ...publicState } = state
  void _warnings

  // Best-effort wallet balance read so the drawer can show "current wallet"
  // alongside the loyalty position.
  let wallet_balance_cents: number | null = null
  try {
    const w = await getOrCreateWallet(profileId)
    wallet_balance_cents = w.balance_cents
  } catch (e: any) {
    warnings.push(`wallet_balance_unavailable: ${e?.message || 'unknown'}`)
  }

  return ok(
    {
      profile,
      state: publicState,
      wallet_balance_cents,
      history,
    },
    {},
    warnings.length ? { data_warnings: warnings } : {}
  )
}

export async function POST(req: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { profileId } = await params
  if (!profileId) return fail('profileId is required.', 400)

  const profile = await loadProfile(auth.db, profileId)
  if (!profile) return fail('Target profile not found.', 404)

  const body = await req.json().catch(() => ({}))
  const amountCents = Number(body?.amount_cents)
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return fail('amount_cents must be a positive integer.', 422)
  }
  if (!reason) {
    return fail('reason is required.', 422)
  }

  // Re-read live state — never trust a stale `available` from the client.
  const state = await computeLoyaltyState(profileId)
  if (amountCents > state.available_credit_cents) {
    return fail(
      'Award exceeds available loyalty credit.',
      422,
      {
        amount_cents:           amountCents,
        available_credit_cents: state.available_credit_cents,
        earned_credit_cents:    state.earned_credit_cents,
        awarded_credit_cents:   state.awarded_credit_cents,
      }
    )
  }

  let tx
  try {
    tx = await credit(
      profileId,
      amountCents,
      reason || 'Loyalty credit',
      undefined,
      {
        kind:        'loyalty_credit',
        awarded_by:  auth.profileId,
        reason,
        source:      'admin_loyalty_ledger',
      }
    )
  } catch (e: any) {
    return fail(e?.message || 'Loyalty credit failed.', 500)
  }

  // Recompute post-award state for the response.
  const after = await computeLoyaltyState(profileId)
  const { _warnings, ...publicAfter } = after
  const meta = _warnings.length ? { data_warnings: _warnings } : {}

  return ok(
    {
      transaction_id:        tx.id,
      balance_after_cents:   tx.balance_after_cents,
      state: publicAfter,
    },
    {},
    meta
  )
}
