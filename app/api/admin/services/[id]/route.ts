import { getClerkUserId } from '@/lib/auth'
import { buildSlug } from '@/lib/fiverr'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { normalizeVertical } from '@/lib/platformConfig'

const TEMPLATE_PRODUCT_TYPE = 'template'
const SERVICE_PRODUCT_TYPE = 'service'
const PRODUCT_TYPES = new Set([SERVICE_PRODUCT_TYPE, TEMPLATE_PRODUCT_TYPE])
const STATUS_VALUES = new Set(['active', 'draft', 'archived'])

async function requireAdmin() {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return { error: 'Unauthorized', status: 401 as const }

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('role')
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (profile?.role !== 'admin') return { error: 'Forbidden', status: 403 as const }
  return { db }
}

function servicePayload(body: Record<string, unknown>) {
  const productType = PRODUCT_TYPES.has(String(body.product_type || body.productType || '').toLowerCase())
    ? String(body.product_type || body.productType).toLowerCase()
    : SERVICE_PRODUCT_TYPE
  const status = STATUS_VALUES.has(String(body.status || '').toLowerCase())
    ? String(body.status).toLowerCase()
    : Boolean(body.is_active) ? 'active' : 'draft'
  const price = Number(body.price_usd ?? body.price ?? 0)
  return {
    title: String(body.title ?? '').trim(),
    category: productType === TEMPLATE_PRODUCT_TYPE ? 'Templates' : (String(body.category ?? '').trim() || 'General'),
    price,
    usd_price: Number(body.usd_price ?? body.price_usd ?? price),
    currency: String(body.currency ?? body.currency_base ?? 'usd').toLowerCase().slice(0, 3),
    delivery_days: Number(body.delivery_days ?? 7),
    is_active: status === 'active',
    vertical: normalizeVertical(body.vertical),
    product_type: productType,
    slug: null as string | null,
    short_description: String(body.short_description ?? '').trim() || null,
    full_description: String(body.full_description ?? '').trim() || null,
    region: String(body.region ?? '').trim() || null,
    template_type: String(body.template_type ?? '').trim() || null,
    currency_base: String(body.currency_base ?? 'USD').toUpperCase(),
    price_cad_display: body.price_cad_display === '' || body.price_cad_display == null ? null : Number(body.price_cad_display),
    badge: String(body.badge ?? '').trim() || null,
    status,
    delivery_type: String(body.delivery_type ?? (productType === TEMPLATE_PRODUCT_TYPE ? 'Digital Template' : '')).trim() || null,
    file_path: String(body.file_path ?? '').trim() || null,
  }
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params
  const body = await req.json().catch(() => ({})) as Record<string, unknown>

  // Slugs are public identifiers, not presentation fields. Read the stored
  // value before building the update so an omitted slug can never become NULL
  // and a title edit can never silently rewrite an indexed URL.
  const { data: existing, error: existingError } = await auth.db
    .from('services')
    .select('id, slug, title, status, is_active')
    .eq('id', id)
    .single()
  if (existingError || !existing) {
    return Response.json({ error: existingError?.message || 'Service not found' }, { status: 404 })
  }

  const payload = servicePayload(body)
  if (!payload.title || !Number.isFinite(payload.price) || payload.price < 0) {
    return Response.json({ error: 'Invalid service payload' }, { status: 400 })
  }

  const currentSlug = typeof existing.slug === 'string' ? existing.slug.trim() : ''
  const requestedSlug = typeof body.slug === 'string' ? body.slug.trim() : ''
  const isPublished = existing.status === 'active' || existing.is_active === true

  let nextSlug = currentSlug
  if (!nextSlug) {
    // Legacy rows without a slug get one clean identifier without changing any
    // existing public URL because there is no old slug to invalidate.
    nextSlug = buildSlug(requestedSlug || payload.title || String(existing.title || 'service'))
  } else if (requestedSlug && requestedSlug !== currentSlug) {
    const normalized = buildSlug(requestedSlug)
    if (isPublished && normalized !== currentSlug) {
      return Response.json(
        { error: 'Published service URLs are permanent. Keep the current slug and update the title or SEO fields instead.' },
        { status: 409 },
      )
    }
    nextSlug = normalized
  }
  payload.slug = nextSlug || null

  // Draft slug edits may be normalized, but never allow them to collide with
  // another service URL. Older schemas without a slug column simply skip this
  // guard and retain the existing legacy fallback below.
  if (nextSlug && nextSlug !== currentSlug) {
    const { data: collision, error: collisionError } = await auth.db
      .from('services')
      .select('id')
      .eq('slug', nextSlug)
      .neq('id', id)
      .maybeSingle()
    if (!collisionError && collision) {
      return Response.json({ error: 'That service URL is already in use. Choose a different slug.' }, { status: 409 })
    }
  }

  let result = await auth.db.from('services').update(payload).eq('id', id).select('*').single()
  if (result.error && /column .*vertical/i.test(result.error.message)) {
    const { vertical: _v, ...legacy } = payload
    result = await auth.db.from('services').update(legacy).eq('id', id).select('*').single()
  }
  if (result.error && /column .*product_type|short_description|full_description|template_type|currency_base|price_cad_display|badge|status|delivery_type|file_path|slug/i.test(result.error.message)) {
    const {
      product_type: _pt,
      slug: _slug,
      short_description: _sd,
      full_description: _fd,
      region: _region,
      template_type: _tt,
      currency_base: _cb,
      price_cad_display: _pcd,
      badge: _badge,
      status: _status,
      delivery_type: _dt,
      file_path: _fp,
      ...legacy
    } = payload
    result = await auth.db.from('services').update(legacy).eq('id', id).select('*').single()
  }
  if (result.error) return Response.json({ error: result.error.message }, { status: 500 })
  return Response.json({ service: result.data })
}
