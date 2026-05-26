import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import { ALLOWED_FIELDS, draftField, type SuggestContext, type SuggestField } from '@/lib/seoSuggest'

// Post-create draft endpoint — loads the gig from DB and passes its
// current fields to the shared draft function. For the wizard's
// pre-create flow, use POST /api/seo-suggest (no [id]) which accepts
// the in-progress context directly.
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (!['attorney', 'consultant', 'admin'].includes(auth.role)) return fail('Forbidden.', 403)

  const { id } = await context.params
  const { data: gig, error: loadErr } = await auth.db.from('gigs').select('*').eq('id', id).single()
  if (loadErr || !gig) return fail('Gig not found.', 404)
  if (gig.provider_id !== auth.profileId && auth.role !== 'admin') return fail('Forbidden.', 403)

  const body = await req.json().catch(() => ({}))
  const field = String(body.field || '') as SuggestField
  if (!ALLOWED_FIELDS.includes(field)) return fail(`Field "${field}" is not AI-editable.`, 400)

  const suggestCtx: SuggestContext = {
    title: gig.title,
    tagline: gig.tagline,
    pitch: gig.pitch,
    description: gig.description,
    requirements: gig.requirements,
    category: gig.category,
    subcategory: gig.subcategory,
    jurisdiction: gig.jurisdiction,
    tags: gig.tags,
    seo_title: gig.seo_title,
    seo_description: gig.seo_description,
    faq: Array.isArray(gig.faq) ? gig.faq : null,
  }
  const hint = typeof body.hint === 'string' ? body.hint : ''
  const result = await draftField(field, suggestCtx, hint)
  if (result.ok === false) return fail(result.message, result.status)
  return ok({ field, value: result.value, research: result.research })
}
