import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import { allowedFieldsForRole, draftField, type SuggestContext, type SuggestField, type SuggestRole, type TierSummary } from '@/lib/seoSuggest'

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

  // Role drives prompt vocabulary + per-role allow-list. Prefer the gig's
  // own provider_type (so admin-edited gigs get the gig's role, not the
  // admin's), falling back to the auth'd role.
  const role: SuggestRole =
    gig.provider_type === 'consultant' ? 'consultant'
    : gig.provider_type === 'attorney' ? 'attorney'
    : auth.role === 'consultant' ? 'consultant' : 'attorney'
  if (!allowedFieldsForRole(role).includes(field)) {
    return fail(`Field "${field}" is not AI-editable for this account.`, 400)
  }

  const suggestCtx: SuggestContext = {
    role,
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
    tier: (body?.context?.tier && typeof body.context.tier === 'object')
      ? sanitizeTier(body.context.tier as Record<string, unknown>)
      : null,
    otherTiers: Array.isArray(body?.context?.otherTiers)
      ? body.context.otherTiers
          .filter((o: unknown) => o && typeof o === 'object')
          .map((o: unknown) => sanitizeTier(o as Record<string, unknown>))
      : null,
  }
  const hint = typeof body.hint === 'string' ? body.hint : ''
  const result = await draftField(field, suggestCtx, hint)
  if (result.ok === false) return fail(result.message, result.status)
  return ok({ field, value: result.value, research: result.research })
}
