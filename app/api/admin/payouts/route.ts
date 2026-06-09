/**
 * GET /api/admin/payouts
 * Payout queue, derived from provider_earnings (the canonical ledger the
 * attorney/consultant dashboards and the weekly Tuesday batch all use). Returns
 * order-level rows + a summary the Payout Centre UI renders:
 *   { orders: [...], summary: {...}, providers: [...] }
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
    // Pull every earning that matters to the payout queue.
    const { data: earnings, error: earnErr } = await auth.db
      .from('provider_earnings')
      .select('id, provider_id, order_id, amount_cents, fee_cents, status, created_at')
      .in('status', ['owed', 'releasable', 'paid'])
      .order('created_at', { ascending: true })
    if (earnErr) return fail(earnErr.message, 500)
    const rows = (earnings ?? []) as any[]

    // Hydrate provider name/email/role.
    const providerIds = Array.from(new Set(rows.map((r) => r.provider_id).filter(Boolean)))
    const profileMap = new Map<string, any>()
    if (providerIds.length) {
      const { data: profiles } = await auth.db
        .from('profiles')
        .select('id, full_name, email, role')
        .in('id', providerIds)
      for (const p of profiles ?? []) profileMap.set((p as any).id, p)
    }

    const now = Date.now()
    // Payout-queue status: releasable/owed are "pending" (awaiting payout),
    // paid is "transferred". Connect onboarding is no longer required, so every
    // row is always releasable (connect_ready=true).
    const orders = rows.map((e) => {
      const p = profileMap.get(e.provider_id) || {}
      const amount = Number(e.amount_cents || 0)
      const fee = Number(e.fee_cents || 0)
      return {
        id: e.order_id || e.id,
        earning_id: e.id,
        provider_id: e.provider_id,
        provider_name: p.full_name || p.email || 'Provider',
        provider_email: p.email || null,
        provider_role: p.role || 'consultant',
        payout_status: e.status === 'paid' ? 'transferred' : 'pending',
        earning_status: e.status,
        gross: (amount + fee) / 100,
        payout: amount / 100,
        fee: fee / 100,
        days_waiting: Math.max(0, Math.floor((now - new Date(e.created_at).getTime()) / 86400000)),
        connect_ready: true,
        bypass_active: false,
      }
    })

    const pendingRows = rows.filter((r) => r.status === 'owed' || r.status === 'releasable')
    const paidRows = rows.filter((r) => r.status === 'paid')
    const sumAmt = (list: any[]) => list.reduce((a, r) => a + Number(r.amount_cents || 0), 0)
    const summary = {
      pending: pendingRows.length,
      total_pending_cents: sumAmt(pendingRows),
      transferred: paidRows.length,
      total_transferred_cents: sumAmt(paidRows),
      failed: 0,
      total_failed_cents: 0,
    }

    // Keep the per-provider aggregate for any consumer that still reads it.
    let providers: any[] = []
    try { providers = await listReleasableByProvider() } catch { /* non-fatal */ }

    return ok({ orders, summary, providers })
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
