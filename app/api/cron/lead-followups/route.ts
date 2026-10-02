/**
 * POST /api/cron/lead-followups
 *
 * Sends the 24h and 72h follow-up emails to free /get-matched intake leads who
 * have not created an account (rules in lib/leadFollowups.ts). Each touch is
 * claimed in inquiries.meta.followups with a conditional update before the
 * email goes out, so overlapping runs never double-send.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` (same pattern as reconcile-incidents).
 * Scheduled hourly by .github/workflows/lead-followups.yml.
 */
import { createSupabaseAdminClient } from '@/lib/supabase'
import { sendEmail, isReservedTestEmail } from '@/lib/email'
import {
  FOLLOWUP_SOURCE,
  STEP_WINDOWS,
  buildFollowupEmail,
  dueStep,
  readFollowups,
  suggestedReview,
  unsubscribeUrl,
} from '@/lib/leadFollowups'

const BATCH_SIZE = 50

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET
  const provided = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!expected || provided !== expected) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createSupabaseAdminClient()
  const now = new Date()
  const oldest = new Date(now.getTime() - STEP_WINDOWS.h72.maxHours * 3600_000).toISOString()
  const youngest = new Date(now.getTime() - STEP_WINDOWS.h24.minHours * 3600_000).toISOString()

  const { data: leads, error } = await db
    .from('inquiries')
    .select('id, email, full_name, country, case_type, case_type_label, answers, meta, access_token, client_profile_id, created_at')
    .eq('source', FOLLOWUP_SOURCE)
    .eq('status', 'open')
    .is('client_profile_id', null)
    .gte('created_at', oldest)
    .lte('created_at', youngest)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 })

  const result = { considered: leads?.length ?? 0, sent: 0, skipped: 0, failed: 0 }

  for (const lead of leads ?? []) {
    const followups = readFollowups(lead.meta)
    const step = dueStep(lead.created_at, followups, now)
    if (!step || isReservedTestEmail(lead.email)) {
      result.skipped++
      continue
    }

    // Skip anyone who has since created an account or unsubscribed on another request.
    const { data: profile } = await db.from('profiles').select('id').eq('email', lead.email).maybeSingle()
    if (profile) {
      result.skipped++
      continue
    }
    const { count: optedOut } = await db
      .from('inquiries')
      .select('id', { count: 'exact', head: true })
      .eq('email', lead.email)
      .not('meta->followups->>opted_out', 'is', null)
    if ((optedOut ?? 0) > 0) {
      result.skipped++
      continue
    }

    const { data: offers } = await db.from('attorney_offers').select('status').eq('inquiry_id', lead.id)
    if ((offers ?? []).some((o) => o.status === 'accepted')) {
      result.skipped++
      continue
    }
    const pendingOffers = (offers ?? []).filter((o) => o.status === 'sent').length

    // Claim the touch first. The filter makes the update a no-op if another run got there.
    const baseMeta = (lead.meta && typeof lead.meta === 'object' ? lead.meta : {}) as Record<string, unknown>
    const claimed = { ...baseMeta, followups: { ...followups, [step]: now.toISOString() } }
    const { data: claimRows } = await db
      .from('inquiries')
      .update({ meta: claimed })
      .eq('id', lead.id)
      .is(`meta->followups->>${step}`, null)
      .select('id')
    if (!claimRows || claimRows.length === 0) {
      result.skipped++
      continue
    }

    const { subject, html } = buildFollowupEmail({
      step,
      fullName: lead.full_name ?? '',
      caseLabel: lead.case_type_label ?? lead.case_type ?? null,
      pendingOffers,
      review: step === 'h72' ? suggestedReview(lead.country, lead.case_type, lead.answers) : null,
      unsubscribeUrl: unsubscribeUrl(lead.id, lead.access_token),
    })

    try {
      await sendEmail({ to: lead.email, subject, html })
      result.sent++
    } catch (e) {
      // Release the claim so the next hourly run retries this touch.
      await db.from('inquiries').update({ meta: { ...baseMeta, followups } }).eq('id', lead.id)
      console.error('[lead-followups] send failed', (e as Error)?.message)
      result.failed++
    }
  }

  return Response.json({ ok: true, ...result })
}
