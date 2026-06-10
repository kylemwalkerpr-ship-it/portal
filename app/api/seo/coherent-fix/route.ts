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
// We additionally:
//   1. Pull a fresh audit so we can pass the audit's
//      `intentBucketHints` (missing buckets + example phrases) into
//      the AI prompt — this is what makes the "broaden intent
//      coverage" fix actually move the intent.covered count.
//   2. Project a post-rewrite audit and return an
//      `expectedScoreDelta` so the modal can show
//      "Score: 46 → 71 (+25)" closure feedback before the seller
//      commits.
//
// Auth: owner-or-admin — mirrors /api/gigs/[id]/seo-suggest.
// Writes: NONE — the client applies changes via the existing
// PATCH /api/gigs/[id] endpoint after the seller hits "Accept".

import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import { runSeoCoherentFix, changesToPatch, type SeoEditableField } from '@/lib/coherentFix'
// seoAudit (~1.1k lines incl. static rule/keyword data) is lazy-loaded inside
// the handler to keep its evaluation cost off the worker cold-start path.
import type {
  buildExpectedScoreDelta,
  AuditGig,
  AuditRole,
  SellerCredibility,
  SiblingGig,
} from '@/lib/seoAudit'

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
  const issueHint = String(body.issueHint || '').slice(0, 1200)
  const targetFieldsRaw = Array.isArray(body.targetFields) ? body.targetFields : []
  const seed = typeof body.seed === 'number' ? body.seed : undefined
  const targetedKeywordRaw = body.targetedKeyword && typeof body.targetedKeyword === 'object'
    ? body.targetedKeyword as { term?: unknown; intent?: unknown }
    : null
  const targetedKeyword = targetedKeywordRaw && typeof targetedKeywordRaw.term === 'string' && targetedKeywordRaw.term.trim()
    ? {
        term: String(targetedKeywordRaw.term).slice(0, 120),
        intent: typeof targetedKeywordRaw.intent === 'string' ? targetedKeywordRaw.intent.slice(0, 40) : undefined,
      }
    : null
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
  const role: AuditRole =
    gig.provider_type === 'consultant' ? 'consultant'
    : gig.provider_type === 'attorney' ? 'attorney'
    : auth.role === 'consultant' ? 'consultant' : 'attorney'

  // Seller credibility — mirrors /api/gigs/[id]/seo-audit so coherence
  // edits use the same E-E-A-T values the audit graded against.
  let seller: SellerCredibility | null = null
  try {
    seller = await loadSellerCredibility(auth.db, role, gig.provider_id)
  } catch {
    seller = null
  }

  // Sibling list — kept narrow to title + seo_title since the audit
  // only needs them for the cannibalization sweep.
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

  // Pre-rewrite audit — used both to source the intent hints and to
  // anchor the score delta the modal surfaces back to the seller.
  const { runSeoAudit, projectAuditAfterPatch, buildExpectedScoreDelta } = await import('@/lib/seoAudit')
  const beforeAudit = runSeoAudit({ gig: auditGig, role, seller, siblings })

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
    seller: seller ? {
      years_experience: Number(seller.years_experience ?? 0) || 0,
      credential: seller.credential ?? null,
      completed_orders: Number(seller.completed_orders ?? 0) || 0,
      response_hours: Number(seller.response_hours ?? 0) || 0,
      offers_free_consult: !!seller.offers_free_consult,
    } : null,
    role,
    issueId,
    issueLabel,
    issueHint,
    targetFields,
    seed,
    // Only feed intent hints when the issue is one that benefits — we
    // don't want to dilute the prompt for a snippet-engineering fix.
    intentBucketHints: (issueId === 'intent_diversity' || issueId === 'cluster_coverage')
      ? beforeAudit.intentBucketHints.map((h) => ({ bucket: h.bucket, phrases: h.phrases }))
      : undefined,
    targetedKeyword,
  })
  if (result.ok === false) return fail(result.message, result.status)

  // Project the post-rewrite audit so the modal can show the seller
  // exactly what their next score will look like. We patch the audit
  // gig with whatever fields the AI rewrote and re-run the pure
  // function — no fetches, no DB calls.
  let expectedScoreDelta: ReturnType<typeof buildExpectedScoreDelta> | null = null
  try {
    const patch = changesToPatch(result.changes)
    const afterAudit = projectAuditAfterPatch({ gig: auditGig, role, seller, siblings }, patch)
    expectedScoreDelta = buildExpectedScoreDelta(beforeAudit, afterAudit)
  } catch {
    expectedScoreDelta = null
  }

  return ok({ changes: result.changes, expectedScoreDelta })
}

// Copy of the seo-audit helper. Kept inline rather than imported so the
// audit endpoint stays the single owner of its private helper. If this
// grows, both should be hoisted into lib/sellerCredibility.ts.
async function loadSellerCredibility(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  role: 'attorney' | 'consultant',
  providerId: string,
): Promise<SellerCredibility | null> {
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
