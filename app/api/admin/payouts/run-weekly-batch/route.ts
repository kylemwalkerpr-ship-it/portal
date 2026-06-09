/**
 * POST /api/admin/payouts/run-weekly-batch
 * Admin-triggered weekly payout batch. Pays out every `releasable` earning,
 * grouped per provider, into a single payout each (status → paid). The same
 * engine runs automatically every Tuesday via /api/cron/weekly-payouts.
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'
import { runWeeklyPayoutBatch } from '@/lib/earnings'

export async function POST() {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  try {
    const result = await runWeeklyPayoutBatch(auth.profileId)

    await auth.db.from('admin_audit_log').insert({
      admin_id: auth.profileId,
      action_type: 'weekly_payout_batch',
      target_table: 'provider_payouts',
      target_id: result.weekTag,
      payload_snapshot: result,
      reason: `Manual run of weekly payout batch ${result.weekTag}`,
    }).then(() => {}, () => {})

    return ok(result)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Weekly payout batch failed.', 500)
  }
}
