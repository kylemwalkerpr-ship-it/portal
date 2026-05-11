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

  let [profilesRes, ordersRes, itemsRes, servicesRes, settingsRes, consultantsRes, attorneysRes] = await Promise.all([
    db.from('profiles').select('*').order('created_at', { ascending: false }),
    db.from('orders').select('*').order('created_at', { ascending: false }),
    db.from('order_items').select('*'),
    db.from('services').select('*').order('category', { ascending: true }).order('title', { ascending: true }),
    db.from('platform_settings').select('value').eq('key', 'default').single(),
    db.from('consultants').select('id, profile_id, user_id, email, stripe_account_id, stripe_onboarding_complete, stripe_bypass'),
    db.from('attorneys').select('id, profile_id, stripe_account_id, stripe_onboarding_complete, stripe_bypass'),
  ])

  if (consultantsRes.error && /stripe_bypass|schema cache|column/i.test(consultantsRes.error.message)) {
    consultantsRes = await db.from('consultants').select('id, profile_id, user_id, email, stripe_account_id, stripe_onboarding_complete')
  }
  if (attorneysRes.error && /stripe_bypass|schema cache|column/i.test(attorneysRes.error.message)) {
    attorneysRes = await db.from('attorneys').select('id, profile_id, stripe_account_id, stripe_onboarding_complete')
  }

  const error = profilesRes.error || ordersRes.error || itemsRes.error || servicesRes.error
  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Map each profile to a flat connect summary so the admin UI can render the
  // bypass toggle without joining tables itself. Consultants have legacy rows
  // keyed by user_id or email, so we fall back through those when profile_id
  // isn't populated yet.
  const consultantByProfile = new Map<string, Record<string, unknown>>()
  const consultantByEmail = new Map<string, Record<string, unknown>>()
  for (const row of (consultantsRes.data ?? []) as Array<Record<string, unknown>>) {
    const pid = (row.profile_id || row.user_id) as string | undefined
    if (pid) consultantByProfile.set(pid, row)
    const em = String(row.email || '').toLowerCase()
    if (em) consultantByEmail.set(em, row)
  }
  const attorneyByProfile = new Map<string, Record<string, unknown>>()
  for (const row of (attorneysRes.data ?? []) as Array<Record<string, unknown>>) {
    const pid = (row.profile_id) as string | undefined
    if (pid) attorneyByProfile.set(pid, row)
  }

  const connectSummary = (profilesRes.data ?? []).reduce<Record<string, {
    role: string
    record_id: string | null
    stripe_account_id: string | null
    stripe_onboarding_complete: boolean
    stripe_bypass: boolean
  }>>((acc, p) => {
    if (p.role === 'consultant') {
      const row =
        consultantByProfile.get(p.id) ||
        (p.email ? consultantByEmail.get(String(p.email).toLowerCase()) : null)
      acc[p.id] = {
        role: 'consultant',
        record_id: (row?.id as string) || null,
        stripe_account_id: (row?.stripe_account_id as string) || null,
        stripe_onboarding_complete: Boolean(row?.stripe_onboarding_complete),
        stripe_bypass: Boolean(row?.stripe_bypass),
      }
    } else if (p.role === 'attorney') {
      const row = attorneyByProfile.get(p.id)
      acc[p.id] = {
        role: 'attorney',
        record_id: (row?.id as string) || null,
        stripe_account_id: (row?.stripe_account_id as string) || null,
        stripe_onboarding_complete: Boolean(row?.stripe_onboarding_complete),
        stripe_bypass: Boolean(row?.stripe_bypass),
      }
    }
    return acc
  }, {})

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
