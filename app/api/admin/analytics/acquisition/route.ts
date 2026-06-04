/**
 * GET /api/admin/analytics/acquisition
 *
 * Acquisition KPIs — answers "where do users come from and do they convert?"
 *
 * Returns:
 *   signups_30d                  number of profiles created in last 30 days
 *   signups_30d_prev             same window shifted -30d, for delta calc
 *   signups_by_role_30d          { student, consultant, attorney, support }
 *   signups_by_source_30d        { organic, invited, paid }
 *                                 — paid is null because no UTM source is
 *                                   stored on profiles yet
 *   signups_daily_series         [{ date, count }] last 30 days
 *   signup_to_first_order_pct    of profiles created in [60d, 30d), % whose
 *                                first order arrived within 30d of signup
 *   signup_to_first_order_cohort_size  denominator above
 *   top_invite_referrers         top 10 profiles who invited the most others
 *                                via `invited_by` or `referrer_id` columns
 *                                (whichever exists); empty if neither
 *
 * Self-heals — any single query failure becomes a `data_warnings` string,
 * never a 500.
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

export async function GET() {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db } = auth

  const data_warnings: string[] = []
  const now = Date.now()
  const ago30 = new Date(now - 30 * 86400_000).toISOString()
  const ago60 = new Date(now - 60 * 86400_000).toISOString()

  // ── Profiles (last 60 days for cohort calc) ──────────────────────────────────
  let profiles: any[] = []
  let inviteFieldUsed: string | null = null
  try {
    // Try the broadest select; if `invited_by` doesn't exist we fall back.
    const tryCols = [
      'id, role, created_at, invited_by',
      'id, role, created_at, referrer_id',
      'id, role, created_at',
    ]
    let lastErr: any = null
    for (const cols of tryCols) {
      const { data, error } = await db
        .from('profiles')
        .select(cols)
        .gte('created_at', ago60)
      if (!error) {
        profiles = data ?? []
        if (cols.includes('invited_by')) inviteFieldUsed = 'invited_by'
        else if (cols.includes('referrer_id')) inviteFieldUsed = 'referrer_id'
        break
      }
      lastErr = error
    }
    if (!profiles.length && lastErr) throw lastErr
  } catch (e: any) {
    data_warnings.push(`profiles: ${e?.message || 'unavailable'}`)
  }

  const signups30 = profiles.filter(p => p.created_at >= ago30)
  const signupsPrev = profiles.filter(p => p.created_at < ago30 && p.created_at >= ago60)

  const signups_by_role_30d: Record<string, number> = { student: 0, consultant: 0, attorney: 0, support: 0, other: 0 }
  for (const p of signups30) {
    if (p.role && p.role in signups_by_role_30d) signups_by_role_30d[p.role]++
    else signups_by_role_30d.other++
  }

  const signups_by_source_30d: Record<string, number | null> = {
    organic: 0,
    invited: 0,
    paid: null, // not tracked yet
  }
  if (inviteFieldUsed) {
    for (const p of signups30) {
      const ref = (p as any)[inviteFieldUsed]
      if (ref) signups_by_source_30d.invited = (signups_by_source_30d.invited as number) + 1
      else signups_by_source_30d.organic = (signups_by_source_30d.organic as number) + 1
    }
  } else {
    // Invited card already renders "Coming Soon" with the missing-column hint;
    // don't double-surface as a Partial-data banner.
    signups_by_source_30d.invited = null
    signups_by_source_30d.organic = signups30.length
  }

  // Daily series over the trailing 30 days
  const dayBuckets: Record<string, number> = {}
  for (const p of signups30) {
    const k = String(p.created_at).slice(0, 10)
    dayBuckets[k] = (dayBuckets[k] ?? 0) + 1
  }
  const signups_daily_series: Array<{ date: string; count: number }> = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 86400_000).toISOString().slice(0, 10)
    signups_daily_series.push({ date: d, count: dayBuckets[d] ?? 0 })
  }

  // ── Signup → first order (cohort: profiles created [60d, 30d) ago) ───────────
  let signup_to_first_order_pct = 0
  let signup_to_first_order_cohort_size = 0
  try {
    const cohort = profiles.filter(p => p.created_at < ago30 && p.created_at >= ago60)
    signup_to_first_order_cohort_size = cohort.length

    if (cohort.length) {
      const cohortIds = cohort.map(p => p.id)
      const { data: ords, error } = await db
        .from('orders')
        .select('client_id, created_at')
        .in('client_id', cohortIds)
        .order('created_at', { ascending: true })
      if (error) throw error

      const firstOrderByClient: Record<string, string> = {}
      for (const o of ords ?? []) {
        if (o.client_id && !firstOrderByClient[o.client_id]) {
          firstOrderByClient[o.client_id] = o.created_at
        }
      }
      let converted = 0
      for (const p of cohort) {
        const fo = firstOrderByClient[p.id]
        if (!fo) continue
        const lagMs = new Date(fo).getTime() - new Date(p.created_at).getTime()
        if (lagMs <= 30 * 86400_000 && lagMs >= 0) converted++
      }
      signup_to_first_order_pct = (converted / cohort.length) * 100
    }
  } catch (e: any) {
    data_warnings.push(`signup_to_first_order: ${e?.message || 'unavailable'}`)
  }

  // ── Top invite referrers ─────────────────────────────────────────────────────
  let top_invite_referrers: Array<{ profile_id: string; name: string | null; invites: number }> = []
  if (inviteFieldUsed) {
    try {
      // Fetch the inviter ids for all profiles created in last 365d
      const { data, error } = await db
        .from('profiles')
        .select(`id, ${inviteFieldUsed}`)
        .gte('created_at', new Date(now - 365 * 86400_000).toISOString())
      if (error) throw error
      const counts: Record<string, number> = {}
      for (const row of data ?? []) {
        const ref = (row as any)[inviteFieldUsed]
        if (ref) counts[ref] = (counts[ref] ?? 0) + 1
      }
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10)
      const topIds = top.map(([id]) => id)
      const nameMap: Record<string, string> = {}
      if (topIds.length) {
        const { data: profs } = await db
          .from('profiles')
          .select('id, full_name, email')
          .in('id', topIds)
        for (const p of profs ?? []) nameMap[p.id] = p.full_name || p.email || ''
      }
      top_invite_referrers = top.map(([profile_id, invites]) => ({
        profile_id,
        name: nameMap[profile_id] || null,
        invites,
      }))
    } catch (e: any) {
      data_warnings.push(`top_invite_referrers: ${e?.message || 'unavailable'}`)
    }
  }

  return ok({
    signups_30d: signups30.length,
    signups_30d_prev: signupsPrev.length,
    signups_by_role_30d,
    signups_by_source_30d,
    signups_daily_series,
    signup_to_first_order_pct,
    signup_to_first_order_cohort_size,
    top_invite_referrers,
    schema_notes: {
      paid_source_tracking: 'not_implemented',
      invite_field_used: inviteFieldUsed,
    },
    data_warnings,
  })
}
