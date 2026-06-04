/**
 * GET /api/admin/attorney-applications/[id]/lifecycle
 *
 * Mirror of the consultant lifecycle endpoint, scoped to the attorney lane:
 * reads the `attorneys` row instead of `consultants` and scopes gigs by
 * provider_type='attorney' where supported. See the consultant version for
 * the full response contract and self-heal rationale.
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

  const { data: app, error: appErr } = await db
    .from('attorney_applications')
    .select('id, profile_id')
    .eq('id', id)
    .maybeSingle()
  if (appErr) return fail(appErr.message, 500)
  if (!app) return fail('Application not found.', 404)

  const profileId = (app as { profile_id: string | null }).profile_id

  let profileFullName: string | null = null
  if (profileId) {
    const { data: prof } = await db
      .from('profiles')
      .select('full_name')
      .eq('id', profileId)
      .maybeSingle()
    profileFullName = (prof as { full_name: string | null } | null)?.full_name ?? null
  }

  let att: Record<string, unknown> | null = null
  if (profileId) {
    const attRes = await db
      .from('attorneys')
      .select('headshot_url, tagline, bio, intro')
      .eq('profile_id', profileId)
      .maybeSingle()
    if (attRes.error && /(column .* does not exist|relation .* does not exist)/i.test(attRes.error.message || '')) {
      warnings.push('attorneys_columns_missing')
    } else if (!attRes.error) {
      att = (attRes.data as Record<string, unknown> | null) ?? null
    }
  }

  let firstGigPublished = false
  if (profileId) {
    const scoped = await db
      .from('gigs')
      .select('id', { count: 'exact', head: true })
      .eq('provider_id', profileId)
      .eq('provider_type', 'attorney')
      .eq('status', 'active')
    if (scoped.error) {
      if (/column .* does not exist/i.test(scoped.error.message || '')) {
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

  let firstOrder = false
  if (profileId) {
    // Attorney lane orders use attorney_id (mirrors consultant_id in the
    // consultant lane). Self-heal if column doesn't exist.
    const ordRes = await db
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('attorney_id', profileId)
    if (ordRes.error) {
      if (/column .* does not exist/i.test(ordRes.error.message || '')) warnings.push('orders_attorney_id_missing')
      else if (/relation .* does not exist/i.test(ordRes.error.message || '')) warnings.push('orders_table_missing')
    } else {
      firstOrder = Number(ordRes.count ?? 0) > 0
    }
  }

  let firstPayout = false
  if (profileId) {
    const candidates = ['payouts', 'attorney_payouts', 'earnings']
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
          const alt = await db
            .from(tbl)
            .select('id', { count: 'exact', head: true })
            .eq('attorney_id', profileId)
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

  const taglineLen = typeof att?.tagline === 'string' ? (att.tagline as string).trim().length : 0
  const bioLen     = typeof att?.bio === 'string'     ? (att.bio as string).trim().length     : (typeof att?.intro === 'string' ? (att.intro as string).trim().length : 0)
  const hasHeadshot = typeof att?.headshot_url === 'string' && (att.headshot_url as string).length > 0

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
