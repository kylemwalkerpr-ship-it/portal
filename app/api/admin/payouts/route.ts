/**
 * GET /api/admin/payouts
 * Manual payout queue — providers with releasable earnings.
 *
 * POST /api/admin/payouts
 * Mark a batch of earnings as paid. Body:
 *   { providerId, earningIds[], method, reference, notes }
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'
import { listReleasableByProvider, recordPayout } from '@/lib/earnings'

export async function GET() {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  try {
    const providers = await listReleasableByProvider()
    return ok({ providers })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Queue load failed'
    return fail(msg, 500)
  }
}

export async function POST(req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const body = await req.json().catch(() => ({}))
  const providerId = String(body.providerId || '')
  const earningIds = Array.isArray(body.earningIds) ? body.earningIds : []
  const method = String(body.method || 'manual')
  const reference = String(body.reference || '')
  const notes = String(body.notes || '')

  if (!providerId || !earningIds.length) {
    return fail('providerId and earningIds are required.', 400)
  }

  // Validate earning IDs belong to this provider and are releasable
  const { data: earnings, error: earnErr } = await auth.db
    .from('provider_earnings')
    .select('id, amount_cents')
    .eq('provider_id', providerId)
    .eq('status', 'releasable')
    .in('id', earningIds)

  if (earnErr) return fail(earnErr.message, 500)
  const foundIds = (earnings ?? []).map((e: any) => e.id)
  const missing = earningIds.filter((id: string) => !foundIds.includes(id))
  if (missing.length) {
    return fail(`Some earnings are not releasable or do not belong to this provider: ${missing.join(', ')}`, 400)
  }

  const totalCents = (earnings ?? []).reduce((s: number, e: any) => s + Number(e.amount_cents), 0)

  try {
    const payout = await recordPayout(providerId, {
      amountCents: totalCents,
      method,
      reference,
      notes,
      markedBy: auth.profileId,
      earningIds: foundIds,
    })

    await auth.db.from('admin_audit_log').insert({
      admin_id: auth.profileId,
      action_type: 'manual_payout',
      target_table: 'provider_payouts',
      target_id: payout.id,
      payload_snapshot: { providerId, earningIds: foundIds, amountCents: totalCents, method, reference },
      reason: notes || 'Admin manual payout',
    })

    return ok({ payout })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Payout recording failed'
    return fail(msg, 500)
  }
}
