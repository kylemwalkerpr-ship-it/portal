/**
 * POST /api/cron/reconcile-incidents
 *
 * Drains open payment_incidents (see supabase/checkout_idempotency.sql):
 *  - earning_credit_failed → retries creditEarning (skips if the earning
 *    already exists for that order+provider, so retries are idempotent).
 *  - other kinds (charge_without_order, debit_without_order, refund_failed)
 *    require a human decision — they are only counted and surfaced.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` (same pattern as weekly-payouts).
 * Schedule hourly via GitHub Actions or any external scheduler.
 */
import { createSupabaseAdminClient } from '@/lib/supabase'
import { creditEarning } from '@/lib/earnings'

const BATCH_SIZE = 25

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET
  const provided = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!expected || provided !== expected) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createSupabaseAdminClient()

  const { data: incidents, error } = await db
    .from('payment_incidents')
    .select('id, profile_id, kind, amount_cents, context')
    .eq('resolved', false)
    .eq('kind', 'earning_credit_failed')
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }

  let retried = 0
  let resolved = 0
  let stillFailing = 0

  for (const incident of incidents ?? []) {
    const ctx = (incident.context ?? {}) as Record<string, unknown>
    const orderId = typeof ctx.orderId === 'string' ? ctx.orderId : null
    const source = ctx.source === 'offer' ? 'offer' : 'gig'
    if (!orderId || !incident.profile_id || !incident.amount_cents) {
      // Unactionable row — leave for manual review.
      continue
    }

    retried++
    try {
      // Idempotency: skip if the earning already landed (e.g. partial success
      // before the original failure, or a previous cron run).
      const { data: existing } = await db
        .from('provider_earnings')
        .select('id')
        .eq('order_id', orderId)
        .eq('provider_id', incident.profile_id)
        .maybeSingle()

      if (!existing) {
        await creditEarning({
          providerId: incident.profile_id,
          orderId,
          source,
          amountCents: incident.amount_cents,
        })
      }

      await db
        .from('payment_incidents')
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq('id', incident.id)
      resolved++
    } catch (e) {
      stillFailing++
      console.error(`[reconcile-incidents] retry failed for incident ${incident.id}:`, e)
    }
  }

  // Surface counts of incident kinds needing manual attention.
  const { count: manualCount } = await db
    .from('payment_incidents')
    .select('id', { count: 'exact', head: true })
    .eq('resolved', false)
    .neq('kind', 'earning_credit_failed')

  return Response.json({
    ok: true,
    retried,
    resolved,
    stillFailing,
    openManualIncidents: manualCount ?? 0,
  })
}
