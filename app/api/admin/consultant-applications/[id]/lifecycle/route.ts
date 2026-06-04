/**
 * GET /api/admin/consultant-applications/[id]/lifecycle
 *
 * Onboarding-progress read-out for the admin drawer. Each tile is a single
 * boolean derived from cheap COUNT / EXISTS-style queries against
 *   - profiles                (full_name, status)
 *   - consultants             (headshot_url, tagline, bio, intro)
 *   - gigs                    (first published, scoped to provider_type=consultant)
 *   - orders                  (first received, scoped to consultant_id)
 *   - payouts / earnings      (first payout — self-heals if table absent)
 *
 * Response shape:
 *   { lifecycle: {
 *       checks: Array<{ id, label, done, hint? }>,
 *       completed: number,
 *       total: number,
 *     },
 *     meta?: { data_warnings: string[] } }
 *
 * Hard rule: never 500. Any missing table → warning + tile reads false.
 */
import { requireAdminUser } from '@/lib/portalAuth'
import { ok, fail } from '@/lib/apiEnvelope'

type Check = { id: string; label: string; done: boolean; hint?: string }

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db } = auth
  const { id } = await context.params

  const warnings: string[] = []

  // 1. Locate the application + its linked profile.
  const { data: app, error: appErr } = await db
    .from('consultant_applications')
    .select('id, profile_id')
    .eq('id', id)
    .maybeSingle()
  if (appErr) return fail(appErr.message, 500)
  if (!app) return fail('Application not found.', 404)

  const profileId = (app as { profile_id: string | null }).profile_id

  // 2. Profile-side fields (full_name presence is the only cheap signal we
  //    derive from `profiles` — bio/tagline/headshot all live on `consultants`).
  let profileFullName: string | null = null
  if (profileId) {
    const { data: prof } = await db
      .from('profiles')
      .select('full_name')
      .eq('id', profileId)
      .maybeSingle()
    profileFullName = (prof as { full_name: string | null } | null)?.full_name ?? null
  }

  // 3. Consultant-side fields. Self-heal if the column set differs.
  let cons: Record<string, unknown> | null = null
  if (profileId) {
    const consRes = await db
      .from('consultants')
      .select('headshot_url, tagline, bio, intro')
      .eq('profile_id', profileId)
      .maybeSingle()
    if (consRes.error && /(column .* does not exist|relation .* does not exist)/i.test(consRes.error.message || '')) {
      warnings.push('consultants_columns_missing')
    } else if (!consRes.error) {
      cons = (consRes.data as Record<string, unknown> | null) ?? null
    }
  }

  // 4. Gigs — first published gig (scoped to consultant lane when supported).
  let firstGigPublished = false
  if (profileId) {
    const scoped = await db
      .from('gigs')
      .select('id', { count: 'exact', head: true })
      .eq('provider_id', profileId)
      .eq('provider_type', 'consultant')
      .eq('status', 'active')
    if (scoped.error) {
      if (/column .* does not exist/i.test(scoped.error.message || '')) {
        // provider_type column missing — fall back to provider_id only.
        const fb = await db
          .from('gigs')
          .select('id', { count: 'exact', head: true })
          .eq('provider_id', profileId)
          .eq('status', 'active')
        firstGigPublished = Number(fb.count ?? 0) > 0
        if (fb.error && /relation .* does not exist/i.test(fb.error.message || '')) {
          warnings.push('gigs_table_missing')
        }
      } else if (/relation .* does not exist/i.test(scoped.error.message || '')) {
        warnings.push('gigs_table_missing')
      }
    } else {
      firstGigPublished = Number(scoped.count ?? 0) > 0
    }
  }

  // 5. Orders — at least one order routed to this consultant.
  let firstOrder = false
  if (profileId) {
    const ordRes = await db
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('consultant_id', profileId)
    if (ordRes.error) {
      if (/column .* does not exist/i.test(ordRes.error.message || '')) warnings.push('orders_consultant_id_missing')
      else if (/relation .* does not exist/i.test(ordRes.error.message || '')) warnings.push('orders_table_missing')
    } else {
      firstOrder = Number(ordRes.count ?? 0) > 0
    }
  }

  // 6. Payouts — try a couple of likely table names. Self-heal if neither
  //    exists; lifecycle tile reads false but we don't surface a warning
  //    unless every candidate is missing.
  let firstPayout = false
  if (profileId) {
    const candidates = ['payouts', 'consultant_payouts', 'earnings']
    let any = false
    let anyMissing = 0
    for (const tbl of candidates) {
      const res = await db
        .from(tbl)
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', profileId)
      if (res.error) {
        if (/relation .* does not exist/i.test(res.error.message || '')) { anyMissing++; continue }
        if (/column .* does not exist/i.test(res.error.message || '')) {
          // Column shape varies (consultant_id vs profile_id). Try consultant_id.
          const alt = await db
            .from(tbl)
            .select('id', { count: 'exact', head: true })
            .eq('consultant_id', profileId)
          if (!alt.error && Number(alt.count ?? 0) > 0) { any = true; break }
          continue
        }
        continue
      }
      if (Number(res.count ?? 0) > 0) { any = true; break }
    }
    firstPayout = any
    if (anyMissing === candidates.length) warnings.push('payouts_table_missing')
  }

  const taglineLen = typeof cons?.tagline === 'string' ? (cons.tagline as string).trim().length : 0
  const bioLen     = typeof cons?.bio === 'string'     ? (cons.bio as string).trim().length     : (typeof cons?.intro === 'string' ? (cons.intro as string).trim().length : 0)
  const hasHeadshot = typeof cons?.headshot_url === 'string' && (cons.headshot_url as string).length > 0

  const checks: Check[] = [
    { id: 'name',          label: 'Full name on profile',              done: !!(profileFullName && profileFullName.trim().length) },
    { id: 'headshot',      label: 'Headshot uploaded',                 done: hasHeadshot, hint: 'Public profile photo required for marketplace listing.' },
    { id: 'tagline',       label: 'Tagline length ≥ 40 chars',         done: taglineLen >= 40 },
    { id: 'bio',           label: 'Bio length ≥ 150 chars',            done: bioLen >= 150 },
    { id: 'first_gig',     label: 'First gig published',               done: firstGigPublished },
    { id: 'first_order',   label: 'First order received',              done: firstOrder },
    { id: 'first_payout',  label: 'First payout processed',            done: firstPayout },
  ]

  return ok(
    {
      lifecycle: {
        checks,
        completed: checks.filter(c => c.done).length,
        total: checks.length,
      },
    },
    {},
    warnings.length ? { data_warnings: warnings } : {},
  )
}
