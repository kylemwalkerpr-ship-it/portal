/**
 * POST /api/admin/wallet/credit/[profileId]
 * Credit a user's wallet (support gift / apology credit / make-good).
 * Body: { amountCents: number, memo: string, reason: string }
 *
 * Auth: either (a) an admin Clerk session OR (b) `Authorization: Bearer <PORTAL_SERVICE_TOKEN>`
 * for service-to-service calls from the yousafe-saas support dashboard.
 * Service-token path attributes via SUPPORT_SAAS_SYSTEM_PROFILE_ID. Mirrors
 * the dual-auth pattern on /api/admin/escrow/[id]/refund + release.
 *
 * Threshold guards are enforced on the SaaS side (support cap = $200);
 * by the time a call reaches here the caller has already been deemed
 * authorised. We still re-validate amountCents > 0 + structural shape.
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'
import { credit, getOrCreateWallet } from '@/lib/wallet'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { computeLoyaltyState } from '@/lib/loyaltyWallet'

async function authViaServiceToken(req: Request) {
  const header = req.headers.get('authorization') || ''
  const m = header.match(/^Bearer\s+(.+)$/i)
  const provided = m?.[1]
  const expected = process.env.PORTAL_SERVICE_TOKEN
  if (!provided || !expected) return null
  if (provided !== expected) return null
  const profileId = process.env.SUPPORT_SAAS_SYSTEM_PROFILE_ID || null
  if (!profileId) return null
  return { db: createSupabaseAdminClient(), profileId }
}

export async function POST(req: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const serviceAuth = await authViaServiceToken(req)
  let db: ReturnType<typeof createSupabaseAdminClient>
  let actorId: string
  if (serviceAuth) {
    db = serviceAuth.db
    actorId = serviceAuth.profileId
  } else {
    const auth = await requireAdminUser()
    if ('error' in auth) return fail(auth.error, auth.status)
    db = auth.db
    actorId = auth.profileId
  }

  const { profileId } = await params
  if (!profileId) return fail('profileId is required.', 400)

  const body = await req.json().catch(() => ({}))
  const amountCents = Number(body.amountCents)
  const memo = typeof body.memo === 'string' ? body.memo.trim() : ''
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  const inboundMetadata =
    body && typeof body.metadata === 'object' && body.metadata !== null
      ? (body.metadata as Record<string, unknown>)
      : null

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return fail('amountCents must be a positive integer.', 422)
  }
  if (!memo) return fail('memo is required.', 422)
  if (!reason) return fail('reason is required.', 422)

  // Loyalty-credit guard. Free-form admin credits stay unconstrained — only
  // credits explicitly tagged as `kind: 'loyalty_credit'` are bounded by
  // the available loyalty balance. This means callers can't bypass the
  // $10-per-$1000 rule by piping a loyalty award through the generic
  // credit endpoint.
  if (inboundMetadata?.kind === 'loyalty_credit') {
    const state = await computeLoyaltyState(profileId)
    if (amountCents > state.available_credit_cents) {
      return fail(
        'Loyalty credit exceeds available balance.',
        422,
        {
          amount_cents:           amountCents,
          available_credit_cents: state.available_credit_cents,
          earned_credit_cents:    state.earned_credit_cents,
          awarded_credit_cents:   state.awarded_credit_cents,
        }
      )
    }
  }

  // Verify the target profile exists before we try to credit (the wallet
  // RPC will auto-create the wallet row if needed, but a missing profile
  // would create a ghost wallet pointing at nothing).
  const { data: targetProfile, error: profileErr } = await db
    .from('profiles')
    .select('id, email, full_name')
    .eq('id', profileId)
    .single()
  if (profileErr || !targetProfile) {
    return fail('Target profile not found.', 404)
  }

  let tx
  try {
    // Pass through caller metadata (e.g. { kind: 'loyalty_credit',
    // awarded_by: ... }) so the ledger row carries the tag the loyalty
    // calculator looks for. Caller fields take precedence over the
    // defaults below, except that `actor` is always pinned to the
    // authenticated context to prevent spoofing.
    const mergedMetadata: Record<string, unknown> = {
      reason,
      source: 'support_saas',
      ...(inboundMetadata || {}),
      actor: actorId,
    }
    tx = await credit(profileId, amountCents, memo, undefined, mergedMetadata)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Credit failed'
    return fail(message, 500)
  }

  // Re-read balance separately — getOrCreateWallet is idempotent and gives
  // us the canonical post-credit balance even if the RPC's `balance_after_cents`
  // race-conditioned with another concurrent transaction.
  const wallet = await getOrCreateWallet(profileId)

  return ok({
    transactionId: tx.id,
    balanceCents: wallet.balance_cents,
  })
}
