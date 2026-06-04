import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { DEFAULT_PLATFORM_SETTINGS } from '@/lib/platformConfig'

async function requireAdmin() {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return { error: 'Unauthorized', status: 401 as const }

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('id, role')
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (profile?.role !== 'admin') return { error: 'Forbidden', status: 403 as const }
  return { db, adminProfileId: profile.id }
}

export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db } = auth

  let [profilesRes, ordersRes, itemsRes, servicesRes, settingsRes, consultantsRes, attorneysRes]: any[] = await Promise.all([
    db.from('profiles').select('id, full_name, email, role, country, country_code, country_source, status, created_at').order('created_at', { ascending: false }),
    // orders.service_title was removed; the kanban derives the title from
    // order_items → services. Selecting it first and retrying on the error
    // wasted a round-trip every load. Also surface attorney_id, amount_paid,
    // delivery_deadline, progress, and order_number so the command-center UI
    // shows the same data it has on /admin/escrow.
    db.from('orders').select('id, order_number, client_id, consultant_id, attorney_id, total_amount, amount_paid, escrow_status, payout_released_at, status, created_at, delivery_deadline, progress').order('created_at', { ascending: false }),
    db.from('order_items').select('order_id, service_id, subtotal'),
    db
      .from('services')
      .select('id, product_type, slug, title, category, short_description, full_description, region, template_type, price, usd_price, currency, currency_base, price_cad_display, badge, status, is_active, delivery_type, file_path, delivery_days, vertical')
      .order('category', { ascending: true })
      .order('title', { ascending: true }),
    db.from('platform_settings').select('value').eq('key', 'default').single(),
    db.from('consultants').select('id, profile_id, user_id, email'),
    db.from('attorneys').select('id, profile_id'),
  ])

  if (profilesRes.error && /column .*(country_code|country_source)/i.test(profilesRes.error.message)) {
    // Partial migration: country exists but country_code/source don't. Drop
    // just the new columns so the dashboard keeps loading.
    profilesRes = await db.from('profiles').select('id, full_name, email, role, country, status, created_at').order('created_at', { ascending: false })
  }
  if (profilesRes.error && /column .*country/i.test(profilesRes.error.message)) {
    profilesRes = await db.from('profiles').select('id, full_name, email, role, status, created_at').order('created_at', { ascending: false })
  }
  // Belt-and-braces fallback if any of the new columns aren't present in a
  // partially-migrated environment — degrade rather than 500 the dashboard.
  if (ordersRes.error && /column .* does not exist/i.test(ordersRes.error.message)) {
    ordersRes = await db.from('orders').select('id, client_id, consultant_id, total_amount, escrow_status, payout_released_at, status, created_at').order('created_at', { ascending: false })
  }
  if (servicesRes.error && /column .*vertical/i.test(servicesRes.error.message)) {
    servicesRes = await db
      .from('services')
      .select('id, product_type, slug, title, category, short_description, full_description, region, template_type, price, usd_price, currency, currency_base, price_cad_display, badge, status, is_active, delivery_type, file_path, delivery_days')
      .order('category', { ascending: true })
      .order('title', { ascending: true })
  }
  if (servicesRes.error && /column|schema cache/i.test(servicesRes.error.message)) {
    servicesRes = await db
      .from('services')
      .select('id, title, category, price, currency, delivery_days, is_active')
      .order('category', { ascending: true })
      .order('title', { ascending: true })
  }

  const error = profilesRes.error || ordersRes.error || itemsRes.error || servicesRes.error
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const connectSummary = {}

  return Response.json({
    users: profilesRes.data ?? [],
    orders: ordersRes.data ?? [],
    orderItems: itemsRes.data ?? [],
    services: servicesRes.data ?? [],
    settings: { ...DEFAULT_PLATFORM_SETTINGS, ...(settingsRes.data?.value || {}) },
    connectByProfileId: connectSummary,
    currentAdminId: auth.adminProfileId,
  })
}
