import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import { ALLOWED_FIELDS, draftField, type FaqEntry, type SuggestContext, type SuggestField } from '@/lib/seoSuggest'

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
  }
  const hint = typeof body.hint === 'string' ? body.hint : ''
  const result = await draftField(field, suggestCtx, hint)
  if (result.ok === false) return fail(result.message, result.status)
  return ok({ field, value: result.value })
}
