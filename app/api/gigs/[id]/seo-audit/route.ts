// Holistic SEO audit endpoint. Loads the gig + sibling gigs (for the
// cannibalization warning) + seller credibility row (consultant or
// attorney) + live GSC signals when available, then runs the audit and
// returns the structured AuditResult. The new GigSEOAnalytics modal
// renders the result section-by-section.
//
// Auth: owner-or-admin. Mirrors the existing /api/gigs/[id]/seo-suggest
// shape so the modal flows through the same trust boundary.

import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
// seoAudit (~1.1k lines incl. static rule/keyword data) is lazy-loaded inside
// the handler to keep its evaluation cost off the worker cold-start path.
import type { AuditRole, AuditGig, SellerCredibility, SiblingGig } from '@/lib/seoAudit'
import { fetchGscKeywordSignals } from '@/lib/gscKeywordSignals'

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (!['attorney', 'consultant', 'admin'].includes(auth.role)) return fail('Forbidden.', 403)

  const { id } = await context.params
  const { data: gig, error: loadErr } = await auth.db
    .from('gigs')
    .select('*, tiers:gig_tiers(*)')
    .eq('id', id)
    .single()
  if (loadErr || !gig) return fail('Gig not found.', 404)
  if (gig.provider_id !== auth.profileId && auth.role !== 'admin') return fail('Forbidden.', 403)

  // Role drives the cluster map + jurisdiction-term layer. Prefer the
  // gig's own provider_type (admin-edited gigs get the gig's role,
  // not the admin's), falling back to the auth'd role.
  const role: AuditRole =
    gig.provider_type === 'consultant' ? 'consultant'
    : gig.provider_type === 'attorney' ? 'attorney'
    : auth.role === 'consultant' ? 'consultant' : 'attorney'

  // Sibling gigs for the cannibalization + internal-link check. We
  // intentionally trim down to title + seo_title — full bodies would
  // bloat the response with no scoring value.
  const { data: sibRows } = await auth.db
    .from('gigs')
    .select('id, title, seo_title, status, provider_id, provider_type')
    .eq('provider_id', gig.provider_id)
    .eq('provider_type', gig.provider_type)
    .neq('status', 'deleted')
    .limit(50)
  const siblings: SiblingGig[] = (sibRows ?? [])
    .filter((r: { id: string }) => r.id !== gig.id)
    .map((r: { id: string; title: string | null; seo_title: string | null }) => ({
      id: r.id, title: r.title, seo_title: r.seo_title,
    }))

  // Seller credibility — pulled from the role-specific profile row.
  // Either lookup can return null (incomplete onboarding); the audit
  // gracefully degrades the E-E-A-T section in that case.
  const seller: SellerCredibility | null = await loadSellerCredibility(auth.db, role, gig.provider_id)

  // Live GSC signals. Returns null when env vars are missing or the
  // GSC call fails — the audit reports gscEnabled=false and weights
  // are renormalized so the headline score stays comparable.
  const gscSignals = (gig.category && (gig.jurisdiction === 'us' || gig.jurisdiction === 'uk' || gig.jurisdiction === 'ca'))
    ? await fetchGscKeywordSignals({ category: gig.category, jurisdiction: gig.jurisdiction })
    : null

  const auditGig: AuditGig = {
    id: gig.id,
    title: gig.title,
    pitch: gig.pitch,
    tagline: gig.tagline,
    description: gig.description,
    tags: gig.tags,
    category: gig.category,
    subcategory: gig.subcategory,
    jurisdiction: gig.jurisdiction,
    seo_title: gig.seo_title,
    seo_description: gig.seo_description,
    faq: Array.isArray(gig.faq) ? gig.faq : null,
    tiers: Array.isArray(gig.tiers) ? gig.tiers : null,
  }
  const { runSeoAudit } = await import('@/lib/seoAudit')
  const result = runSeoAudit({ gig: auditGig, role, seller, siblings, gscSignals })
  return ok({ audit: result, role, gigSummary: { id: gig.id, title: gig.title, slug: gig.slug, status: gig.status } })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadSellerCredibility(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  role: AuditRole,
  providerId: string,
): Promise<SellerCredibility | null> {
  // Both tables key by profile_id (see lib/attorneyProfileStrength.ts
  // and lib/consultantProfileStrength.ts).
  try {
    const table = role === 'attorney' ? 'attorneys' : 'consultants'
    const { data } = await db
      .from(table)
      .select('id, years_experience, education, offers_free_consult')
      .eq('profile_id', providerId)
      .maybeSingle()
    if (!data) return null
    // Credential string — for attorneys it's typically a Bar admission
    // / "JD" / "Esq"; for consultants we leave this null unless the
    // profile carries an explicit credential column (RCIC, OISC, etc).
    // Either way we surface whatever the row exposes; the E-E-A-T
    // section degrades gracefully when the field is missing.
    let credential: string | null = null
    const edu = (data as Record<string, unknown>).education
    if (Array.isArray(edu) && edu.length > 0) {
      const first = edu[0] as Record<string, unknown>
      credential = typeof first?.credential === 'string'
        ? (first.credential as string)
        : typeof first?.degree === 'string'
          ? (first.degree as string)
          : null
    }
    return {
      years_experience: Number((data as Record<string, unknown>).years_experience ?? 0) || 0,
      credential,
      offers_free_consult: !!(data as Record<string, unknown>).offers_free_consult,
      // completed_orders + response_hours aren't stored on the
      // attorneys/consultants tables today; surface them as undefined
      // so the audit treats them as absent rather than zero.
      completed_orders: null,
      response_hours: null,
    }
  } catch {
    return null
  }
}
