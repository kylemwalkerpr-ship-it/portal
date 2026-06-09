/**
 * POST /api/cron/weekly-payouts
 * Scheduled weekly payout batch (runs every Tuesday). Guarded by a shared
 * secret so only the scheduler can trigger it.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` (env CRON_SECRET).
 * The Tuesday schedule is wired in .github/workflows/weekly-payouts.yml.
 */
import { createSupabaseAdminClient } from '@/lib/supabase'
import { runWeeklyPayoutBatch } from '@/lib/earnings'

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET
  const provided = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!expected || provided !== expected) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runWeeklyPayoutBatch('system:cron')

    // Best-effort audit trail (system actor).
    try {
      await createSupabaseAdminClient().from('admin_audit_log').insert({
        admin_id: null,
        action_type: 'weekly_payout_batch',
        target_table: 'provider_payouts',
        target_id: result.weekTag,
        payload_snapshot: result,
        reason: `Scheduled weekly payout batch ${result.weekTag}`,
      })
    } catch { /* non-fatal */ }

    return Response.json({ ok: true, ...result })
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : 'Batch failed' }, { status: 500 })
  }
}
