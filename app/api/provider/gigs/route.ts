import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { findConsultantForProfile } from '@/lib/consultant'

async function getProvider() {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return { error: 'Unauthorized', status: 401 as const }
  const db = createSupabaseAdminClient()
  const { data: profile } = await db.from('profiles').select('*').eq('clerk_user_id', clerkUserId).single()
  if (!profile || !['attorney', 'consultant'].includes(String(profile.role))) {
    return { error: 'Forbidden', status: 403 as const }
  }
  if (profile.role === 'attorney') {
    const { data: attorney } = await db.from('attorneys').select('id').eq('profile_id', profile.id).single()
    if (!attorney) return { error: 'Attorney profile not found.', status: 404 as const }
    return { db, profile, role: 'attorney' as const, attorneyId: attorney.id, consultantId: null }
  }
  const consultant = await findConsultantForProfile(db, profile)
  if (!consultant) return { error: 'Consultant profile not found.', status: 404 as const }
  return { db, profile, role: 'consultant' as const, attorneyId: null, consultantId: consultant.id }
}

function normalizeTier(tier: Record<string, unknown>, index: number) {
  return {
    tier_name: ['basic', 'standard', 'premium'].includes(String(tier.tier_name)) ? tier.tier_name : ['basic', 'standard', 'premium'][index],
    title: String(tier.title || '').trim().slice(0, 120),
    description: String(tier.description || '').trim().slice(0, 1200),
    price: Number(tier.price),
    delivery_days: Number(tier.delivery_days),
    revision_count: Math.max(0, Math.min(10, Math.trunc(Number(tier.revision_count ?? 1)))),
    included_features: Array.isArray(tier.included_features) ? tier.included_features.map(String).slice(0, 12) : [],
    constraints: typeof tier.constraints === 'object' && tier.constraints ? tier.constraints : {},
    sort_order: index,
  }
}

export async function GET() {
  const provider = await getProvider()
  if ('error' in provider) return Response.json({ error: provider.error }, { status: provider.status })

  const { data: gigs, error } = await provider.db
    .from('provider_gigs')
    .select('*, tiers:provider_gig_tiers(*)')
    .eq('provider_role', provider.role)
    .eq('provider_profile_id', provider.profile.id)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ gigs: gigs ?? [] })
}

export async function POST(req: Request) {
  const provider = await getProvider()
  if ('error' in provider) return Response.json({ error: provider.error }, { status: provider.status })

  const body = await req.json().catch(() => ({}))
  const title = String(body.title || '').trim().slice(0, 160)
  const summary = String(body.summary || '').trim().slice(0, 1200)
  const tiers = Array.isArray(body.tiers) ? body.tiers.slice(0, 3).map(normalizeTier) : []
  if (!title || !summary) return Response.json({ error: 'Title and summary are required.' }, { status: 400 })
  if (tiers.length === 0 || tiers.some(t => !t.title || !t.description || !Number.isFinite(t.price) || t.price <= 0 || !Number.isInteger(t.delivery_days) || t.delivery_days <= 0)) {
    return Response.json({ error: 'Add one to three valid pricing tiers.' }, { status: 400 })
  }

  const { count } = await provider.db
    .from('provider_gigs')
    .select('id', { count: 'exact', head: true })
    .eq('provider_role', provider.role)
    .eq('provider_profile_id', provider.profile.id)
    .neq('status', 'archived')
  if ((count ?? 0) >= 5) return Response.json({ error: 'You can create up to 5 gigs.' }, { status: 409 })

  const { data: gig, error } = await provider.db
    .from('provider_gigs')
    .insert({
      provider_role: provider.role,
      provider_profile_id: provider.profile.id,
      attorney_id: provider.attorneyId,
      consultant_id: provider.consultantId,
      title,
      summary,
      category: String(body.category || '').trim().slice(0, 80) || null,
      tags: Array.isArray(body.tags) ? body.tags.map(String).slice(0, 10) : [],
      image_url: String(body.image_url || '').trim() || null,
      status: ['draft', 'active', 'paused'].includes(String(body.status)) ? body.status : 'active',
    })
    .select('*')
    .single()
  if (error || !gig) return Response.json({ error: error?.message || 'Could not create gig.' }, { status: 500 })

  const { error: tierErr } = await provider.db.from('provider_gig_tiers').insert(tiers.map(t => ({ ...t, gig_id: gig.id })))
  if (tierErr) return Response.json({ error: tierErr.message }, { status: 500 })
  return Response.json({ gig })
}
