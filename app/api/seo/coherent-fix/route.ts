// One-click coherent SEO fix.
//
// The SEO Analytics page now has clickable optimization-checklist rows.
// When clicked, the row opens a modal that POSTs here with the row's
// issueId/label/hint and the field(s) the audit said need editing.
// We load the full gig (so the model has byte-accurate context for
// every field) plus seller credibility (so E-E-A-T edits don't fabricate
// numbers), then call runSeoCoherentFix() which returns a structured
// change set the client renders as a diff modal.
//
// Auth: owner-or-admin — mirrors /api/gigs/[id]/seo-suggest.
// Writes: NONE — the client applies changes via the existing
// PATCH /api/gigs/[id] endpoint after the seller hits "Accept".

import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import { runSeoCoherentFix, type SeoEditableField } from '@/lib/coherentFix'

const VALID_FIELDS: SeoEditableField[] = [
  'title', 'seo_title', 'seo_description', 'pitch', 'description', 'tags', 'faq',
]

export async function POST(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (!['attorney', 'consultant', 'admin'].includes(auth.role)) return fail('Forbidden.', 403)

  const body = await req.json().catch(() => ({}))
  const gigId = String(body.gigId || '')
  const issueId = String(body.issueId || '')
  const issueLabel = String(body.issueLabel || '').slice(0, 200)
  const issueHint = String(body.issueHint || '').slice(0, 600)
  const targetFieldsRaw = Array.isArray(body.targetFields) ? body.targetFields : []
  const seed = typeof body.seed === 'number' ? body.seed : undefined
  const targetFields = targetFieldsRaw
    .filter((f: unknown): f is SeoEditableField => typeof f === 'string' && (VALID_FIELDS as string[]).includes(f))
  if (!gigId) return fail('Missing gigId.', 400)
  if (targetFields.length === 0) return fail('targetFields must include at least one editable SEO field.', 400)

  const { data: gig, error: loadErr } = await auth.db
    .from('gigs')
    .select('*, tiers:gig_tiers(*)')
    .eq('id', gigId)
    .single()
  if (loadErr || !gig) return fail('Gig not found.', 404)
  if (gig.provider_id !== auth.profileId && auth.role !== 'admin') return fail('Forbidden.', 403)

  // Resolve role from the gig (admin-edited gigs honour the gig's role).
  const role: 'attorney' | 'consultant' =
    gig.provider_type === 'consultant' ? 'consultant'
    : gig.provider_type === 'attorney' ? 'attorney'
    : auth.role === 'consultant' ? 'consultant' : 'attorney'

  // Seller credibility — mirrors /api/gigs/[id]/seo-audit so coherence
  // edits use the same E-E-A-T values the audit graded against.
  let seller: Awaited<ReturnType<typeof loadSellerCredibility>> = null
  try {
    seller = await loadSellerCredibility(auth.db, role, gig.provider_id)
  } catch {
    seller = null
  }

  const result = await runSeoCoherentFix({
    gig: {
      id: gig.id,
      title: gig.title,
      seo_title: gig.seo_title,
      seo_description: gig.seo_description,
      pitch: gig.pitch,
      description: gig.description,
      tags: Array.isArray(gig.tags) ? gig.tags : null,
      category: gig.category,
      subcategory: gig.subcategory,
      jurisdiction: gig.jurisdiction,
      faq: Array.isArray(gig.faq) ? gig.faq : null,
      tiers: Array.isArray(gig.tiers) ? gig.tiers : null,
    },
    seller,
    role,
    issueId,
    issueLabel,
    issueHint,
    targetFields,
    seed,
  })
  if (result.ok === false) return fail(result.message, result.status)
  return ok({ changes: result.changes })
}

// Copy of the seo-audit helper. Kept inline rather than imported so the
// audit endpoint stays the single owner of its private helper. If this
// grows, both should be hoisted into lib/sellerCredibility.ts.
async function loadSellerCredibility(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  role: 'attorney' | 'consultant',
  providerId: string,
) {
  const table = role === 'attorney' ? 'attorneys' : 'consultants'
  const { data } = await db
    .from(table)
    .select('id, years_experience, education, offers_free_consult')
    .eq('profile_id', providerId)
    .maybeSingle()
  if (!data) return null
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
    completed_orders: null,
    response_hours: null,
  }
}
