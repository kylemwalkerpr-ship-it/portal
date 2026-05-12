import { getClerkUserId } from '@/lib/auth'
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
    slug: String(body.slug ?? '').trim() || null,
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
    stripe_product_id: String(body.stripe_product_id ?? '').trim() || null,
    stripe_price_id_usd: String(body.stripe_price_id_usd ?? '').trim() || null,
    stripe_payment_link_usd: String(body.stripe_payment_link_usd ?? body.stripe_payment_link_url ?? '').trim() || null,
    stripe_price_id_cad: String(body.stripe_price_id_cad ?? '').trim() || null,
    stripe_payment_link_cad: String(body.stripe_payment_link_cad ?? '').trim() || null,
    stripe_payment_link_url: String(body.stripe_payment_link_url ?? body.stripe_payment_link_usd ?? '').trim() || null,
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const payload = servicePayload(await req.json())
  if (!payload.title || !Number.isFinite(payload.price) || payload.price < 0) {
    return Response.json({ error: 'Invalid service payload' }, { status: 400 })
  }

  let result = await auth.db.from('services').insert(payload).select('*').single()
  // Older databases may not have the vertical column yet — retry without it
  // so the admin can keep editing until the migration runs.
  if (result.error && /column .*vertical/i.test(result.error.message)) {
    const { vertical: _v, ...legacy } = payload
    result = await auth.db.from('services').insert(legacy).select('*').single()
  }
  if (result.error && /column .*product_type|short_description|full_description|template_type|currency_base|price_cad_display|badge|status|delivery_type|file_path|stripe_product_id|stripe_price_id_usd|stripe_payment_link_usd|stripe_price_id_cad|stripe_payment_link_cad|slug/i.test(result.error.message)) {
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
      stripe_product_id: _spid,
      stripe_price_id_usd: _spriceusd,
      stripe_payment_link_usd: _splinkusd,
      stripe_price_id_cad: _spricecad,
      stripe_payment_link_cad: _splinkcad,
      ...legacy
    } = payload
    result = await auth.db.from('services').insert(legacy).select('*').single()
  }

  if (result.error) return Response.json({ error: result.error.message }, { status: 500 })
  return Response.json({ service: result.data }, { status: 201 })
}
