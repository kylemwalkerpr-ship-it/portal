/**
 * GET /api/provider/opportunities
 *
 * Trending opportunities feed for PROVIDERS (attorneys + consultants):
 * open student inquiries, newest first, using the same canonical open-queue
 * filter as the attorney inquiry queue so the two views never disagree.
 *
 * Visible only to role ∈ {attorney, consultant} — students/clients get 403.
 * PII is trimmed: providers see first name + initial, never email/phone,
 * until they engage through the normal queue flow.
 */
import { requirePortalUser } from '@/lib/portalAuth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { applyOpenQueueFilter, getAcceptedInquiryIds } from '@/lib/attorneyInquiries'

function publicName(full: string | null | undefined): string {
  const tokens = String(full || '').trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return 'Student'
  if (tokens.length === 1) return tokens[0]
  return `${tokens[0]} ${tokens[tokens.length - 1][0].toUpperCase()}.`
}

export async function GET(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  if (auth.role !== 'attorney' && auth.role !== 'consultant') {
    return Response.json({ error: 'Only attorneys and consultants can view opportunities.' }, { status: 403 })
  }

  const url = new URL(req.url)
  const limit = Math.min(60, Math.max(1, Number(url.searchParams.get('limit') || 24)))

  const db = createSupabaseAdminClient()
  const acceptedIds = await getAcceptedInquiryIds(db)
  const { data, error } = await applyOpenQueueFilter(
    db
      .from('inquiries')
      .select('id, full_name, country, case_type, case_type_label, urgency, recommended_tier, status, source, created_at')
      .order('created_at', { ascending: false })
      .limit(limit),
    acceptedIds,
  )

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const opportunities = (data ?? []).map((q: any) => ({
    id: q.id,
    student: publicName(q.full_name),
    title: q.case_type_label || q.case_type || 'Client inquiry',
    country: q.country || null,
    urgency: (q.urgency || 'normal').toLowerCase(),
    tier: q.recommended_tier || null,
    status: q.status || 'open',
    created_at: q.created_at,
  }))

  return Response.json({ opportunities, role: auth.role })
}
