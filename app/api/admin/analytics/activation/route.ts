/**
 * GET /api/admin/analytics/activation
 *
 * Activation funnel — how fast new signups reach key milestones.
 *
 * Funnel cohort = students created in last 90 days.
 *   stage 1: signed up
 *   stage 2: viewed a gig                (gig_view_events.user_id OR fallback)
 *   stage 3: created an inquiry          (inquiries.client_id)
 *   stage 4: placed first order          (orders.client_id)
 *
 * Time-to-action stats are *medians* (days from signup to milestone) so
 * a few power users don't skew the picture.
 *
 * Returns:
 *   funnel               [{ stage, count, pct_of_signups }]
 *   median_days          { to_view, to_inquiry, to_order }
 *   dropoff_30d_cohort   same funnel but only profiles older than 30d
 *                        (so they had a chance to convert)
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

function median(nums: number[]): number {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}

export async function GET() {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db } = auth

  const data_warnings: string[] = []
  const now = Date.now()
  const ago90 = new Date(now - 90 * 86400_000).toISOString()
  const ago30 = new Date(now - 30 * 86400_000).toISOString()

  // ── Cohort: students created in last 90 days ────────────────────────────────
  let cohort: any[] = []
  try {
    const { data, error } = await db
      .from('profiles')
      .select('id, role, created_at')
      .eq('role', 'client')   // buyers carry role 'client' (shown as "students" in admin)
      .gte('created_at', ago90)
    if (error) throw error
    cohort = data ?? []
  } catch (e: any) {
    data_warnings.push(`profiles: ${e?.message || 'unavailable'}`)
  }
  const cohortIds = cohort.map(p => p.id)
  const cohortAtMap: Record<string, string> = {}
  for (const p of cohort) cohortAtMap[p.id] = p.created_at

  // ── Stage 2: gig view events. Schema may use gig_view_events OR fall back to
  //    gig_metric_events with type='impression' OR not exist at all. ───────────
  const firstViewByUser: Record<string, string> = {}
  let viewTrackingUsed: string | null = null
  if (cohortIds.length) {
    const candidates: Array<{ table: string; userCol: string }> = [
      { table: 'gig_view_events', userCol: 'user_id' },
      { table: 'gig_metric_events', userCol: 'user_id' },
    ]
    for (const c of candidates) {
      try {
        const { data, error } = await db
          .from(c.table)
          .select(`${c.userCol}, created_at`)
          .in(c.userCol, cohortIds)
          .order('created_at', { ascending: true })
        if (error) throw error
        for (const r of data ?? []) {
          const uid = (r as any)[c.userCol]
          if (uid && !firstViewByUser[uid]) firstViewByUser[uid] = (r as any).created_at
        }
        viewTrackingUsed = c.table
        break
      } catch {
        // try the next candidate
      }
    }
    if (!viewTrackingUsed) {
      data_warnings.push('view_tracking_missing — no gig_view_events / gig_metric_events table for cohort')
    }
  }

  // ── Stage 3: first inquiry per client ────────────────────────────────────────
  const firstInquiryByClient: Record<string, string> = {}
  if (cohortIds.length) {
    try {
      const { data, error } = await db
        .from('inquiries')
        .select('client_profile_id, created_at')
        .in('client_profile_id', cohortIds)
        .order('created_at', { ascending: true })
      if (error) throw error
      for (const r of data ?? []) {
        const cid = (r as any).client_profile_id
        if (cid && !firstInquiryByClient[cid]) firstInquiryByClient[cid] = r.created_at
      }
    } catch (e: any) {
      data_warnings.push(`inquiries: ${e?.message || 'unavailable'}`)
    }
  }

  // ── Stage 4: first order per client ──────────────────────────────────────────
  const firstOrderByClient: Record<string, string> = {}
  if (cohortIds.length) {
    try {
      const { data, error } = await db
        .from('orders')
        .select('client_id, created_at')
        .in('client_id', cohortIds)
        .order('created_at', { ascending: true })
      if (error) throw error
      for (const r of data ?? []) {
        if (r.client_id && !firstOrderByClient[r.client_id]) firstOrderByClient[r.client_id] = r.created_at
      }
    } catch (e: any) {
      data_warnings.push(`orders: ${e?.message || 'unavailable'}`)
    }
  }

  // ── Build funnel + median lags ──────────────────────────────────────────────
  const total = cohort.length
  const viewed   = cohort.filter(p => firstViewByUser[p.id]).length
  const inquired = cohort.filter(p => firstInquiryByClient[p.id]).length
  const ordered  = cohort.filter(p => firstOrderByClient[p.id]).length

  const lag = (a: string | undefined, b: string) =>
    a ? (new Date(a).getTime() - new Date(b).getTime()) / 86400_000 : null

  const viewLags    = cohort.map(p => lag(firstViewByUser[p.id], cohortAtMap[p.id])).filter((x): x is number => x !== null && x >= 0)
  const inquiryLags = cohort.map(p => lag(firstInquiryByClient[p.id], cohortAtMap[p.id])).filter((x): x is number => x !== null && x >= 0)
  const orderLags   = cohort.map(p => lag(firstOrderByClient[p.id], cohortAtMap[p.id])).filter((x): x is number => x !== null && x >= 0)

  const funnel = [
    { stage: 'Signed up',        count: total,    pct_of_signups: 100 },
    { stage: 'Viewed a service', count: viewed,   pct_of_signups: total ? (viewed / total) * 100 : 0 },
    { stage: 'Sent inquiry',     count: inquired, pct_of_signups: total ? (inquired / total) * 100 : 0 },
    { stage: 'Placed order',     count: ordered,  pct_of_signups: total ? (ordered / total) * 100 : 0 },
  ]

  // 30d-mature cohort dropoff — only profiles created >30 days ago
  const mature = cohort.filter(p => p.created_at < ago30)
  const mTotal    = mature.length
  const mViewed   = mature.filter(p => firstViewByUser[p.id]).length
  const mInquired = mature.filter(p => firstInquiryByClient[p.id]).length
  const mOrdered  = mature.filter(p => firstOrderByClient[p.id]).length

  const dropoff_30d_cohort = [
    { stage: 'Signed up',        count: mTotal,    pct_of_signups: 100 },
    { stage: 'Viewed a service', count: mViewed,   pct_of_signups: mTotal ? (mViewed / mTotal) * 100 : 0 },
    { stage: 'Sent inquiry',     count: mInquired, pct_of_signups: mTotal ? (mInquired / mTotal) * 100 : 0 },
    { stage: 'Placed order',     count: mOrdered,  pct_of_signups: mTotal ? (mOrdered / mTotal) * 100 : 0 },
  ]

  return ok({
    cohort_size: total,
    funnel,
    dropoff_30d_cohort,
    median_days: {
      to_view:    median(viewLags),
      to_inquiry: median(inquiryLags),
      to_order:   median(orderLags),
    },
    schema_notes: { view_tracking_used: viewTrackingUsed },
    data_warnings,
  })
}
