import { requireAttorney } from '@/lib/attorneyAuth'


export async function GET(req: Request) {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  const url = new URL(req.url)
  const view = url.searchParams.get('view') || 'open' // 'open' | 'mine' | 'all'

  let query = ctx.db
    .from('inquiries')
    .select('id, email, full_name, phone, country, case_type, case_type_label, urgency, recommended_tier, answers, claimed_by_attorney_id, claimed_at, status, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  if (view === 'open') {
    query = query.is('claimed_by_attorney_id', null).eq('status', 'open')
  } else if (view === 'mine') {
    query = query.eq('claimed_by_attorney_id', ctx.attorneyId)
  }

  const { data, error: qErr } = await query
  if (qErr) return Response.json({ error: qErr.message }, { status: 500 })

  return Response.json({ inquiries: data ?? [] })
}
