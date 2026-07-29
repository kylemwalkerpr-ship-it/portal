import { ok, fail, CPU_TIMEOUT_REGEX } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
// seoSuggest (~900 lines of prompt/keyword data) is lazy-loaded inside the
// handler to keep its evaluation cost off the worker cold-start path.
import type { FaqEntry, SuggestContext, SuggestField, SuggestRole, TierSummary } from '@/lib/seoSuggest'

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
  // ── abort guard: client disconnect → fast 499 ──
  if (req.signal.aborted) {
    return Response.json({ error: 'Request cancelled by client' }, { status: 499 })
  }
  const abortHandler = () => { /* no-op */ }
  req.signal.addEventListener('abort', abortHandler)

  try {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (!['attorney', 'consultant', 'admin'].includes(auth.role)) return fail('Forbidden.', 403)

  const body = await req.json().catch(() => ({}))
  const field = String(body.field || '') as SuggestField

  // Resolve role: trust the auth'd role; admin can pass role in the body to
  // draft on a seller's behalf, defaulting to attorney. Drives role-aware
  // prompts, jurisdiction-vocabulary anchors, and per-role allow-list.
  const bodyRole = typeof (body as { role?: unknown }).role === 'string' ? String((body as { role?: string }).role) : null
  const role: SuggestRole =
    auth.role === 'consultant' ? 'consultant'
    : auth.role === 'attorney' ? 'attorney'
    : bodyRole === 'consultant' ? 'consultant' : 'attorney'
  const { allowedFieldsForRole, draftField } = await import('@/lib/seoSuggest')
  if (!allowedFieldsForRole(role).includes(field)) {
    return fail(`Field "${field}" is not AI-editable for this account.`, 400)
  }

  const ctxRaw = (body.context && typeof body.context === 'object') ? body.context as Record<string, unknown> : {}
  const suggestCtx: SuggestContext = {
    role,
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
    // Regeneration: when the seller clicks Regenerate, the button sends the
    // previous draft so the prompt can ask for a distinct alternative.
    previousValue: typeof (body as { previousValue?: unknown }).previousValue === 'string'
      ? String((body as { previousValue?: string }).previousValue).slice(0, 4000)
      : null,
  }
  const hint = typeof body.hint === 'string' ? body.hint : ''
  const result = await draftField(field, suggestCtx, hint)
  if (result.ok === false) return fail(result.message, result.status)
  return ok({ field, value: result.value, research: result.research })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isCpuTimeout = CPU_TIMEOUT_REGEX.test(message)
    return fail(message, isCpuTimeout ? 503 : 500)
  } finally {
    req.signal.removeEventListener('abort', abortHandler)
  }
}
