import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import { ALLOWED_FIELDS, draftField, type FaqEntry, type SuggestContext, type SuggestField, type TierSummary } from '@/lib/seoSuggest'

// Coerce a JSON tier object from the wizard into our typed shape.
// Numbers come through as `number` already in JSON, but Object.values
// can include unknowns from older draft payloads. Reject anything we
// can't safely use; the prompt builder handles missing fields itself.
function sanitizeTier(raw: Record<string, unknown>): TierSummary {
  const t: TierSummary = {}
  if (typeof raw.tier === 'string') t.tier = raw.tier
  if (typeof raw.title === 'string') t.title = raw.title
  if (typeof raw.price === 'number') t.price = raw.price
  if (typeof raw.delivery_days === 'number') t.delivery_days = raw.delivery_days
  if (typeof raw.revisions === 'number') t.revisions = raw.revisions
  if (Array.isArray(raw.features)) {
    t.features = raw.features.filter((f): f is string => typeof f === 'string')
  }
  return t
}

// Pre-create draft endpoint for the gig builder wizard. Accepts the
// seller's in-progress context inline so AI drafting works before a
// gigs row exists. Mirror of /api/gigs/[id]/seo-suggest which loads
// the context from the DB instead.
//
// Body: { field: <SuggestField>, context: <SuggestContext>, hint?: string }
export async function POST(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (!['attorney', 'consultant', 'admin'].includes(auth.role)) return fail('Forbidden.', 403)

  const body = await req.json().catch(() => ({}))
  const field = String(body.field || '') as SuggestField
  if (!ALLOWED_FIELDS.includes(field)) return fail(`Field "${field}" is not AI-editable.`, 400)

  const ctxRaw = (body.context && typeof body.context === 'object') ? body.context as Record<string, unknown> : {}
  const suggestCtx: SuggestContext = {
    title: typeof ctxRaw.title === 'string' ? ctxRaw.title : null,
    tagline: typeof ctxRaw.tagline === 'string' ? ctxRaw.tagline : null,
    pitch: typeof ctxRaw.pitch === 'string' ? ctxRaw.pitch : null,
    description: typeof ctxRaw.description === 'string' ? ctxRaw.description : null,
    requirements: typeof ctxRaw.requirements === 'string' ? ctxRaw.requirements : null,
    category: typeof ctxRaw.category === 'string' ? ctxRaw.category : null,
    subcategory: typeof ctxRaw.subcategory === 'string' ? ctxRaw.subcategory : null,
    jurisdiction: typeof ctxRaw.jurisdiction === 'string' ? ctxRaw.jurisdiction : null,
    tags: Array.isArray(ctxRaw.tags) ? ctxRaw.tags.filter((t): t is string => typeof t === 'string') : null,
    seo_title: typeof ctxRaw.seo_title === 'string' ? ctxRaw.seo_title : null,
    seo_description: typeof ctxRaw.seo_description === 'string' ? ctxRaw.seo_description : null,
    faq: Array.isArray(ctxRaw.faq)
      ? (ctxRaw.faq.filter((f): f is FaqEntry =>
          !!f && typeof f === 'object' &&
          typeof (f as Record<string, unknown>).question === 'string' &&
          typeof (f as Record<string, unknown>).answer === 'string'))
      : null,
    tier: (ctxRaw.tier && typeof ctxRaw.tier === 'object')
      ? sanitizeTier(ctxRaw.tier as Record<string, unknown>)
      : null,
    otherTiers: Array.isArray(ctxRaw.otherTiers)
      ? ctxRaw.otherTiers
          .filter((o) => o && typeof o === 'object')
          .map((o) => sanitizeTier(o as Record<string, unknown>))
      : null,
  }
  const hint = typeof body.hint === 'string' ? body.hint : ''
  const result = await draftField(field, suggestCtx, hint)
  if (result.ok === false) return fail(result.message, result.status)
  return ok({ field, value: result.value, research: result.research })
}
