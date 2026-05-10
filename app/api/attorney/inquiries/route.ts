import { requireAttorney } from '@/lib/attorneyAuth'

// view=open  → all inquiries that haven't converted/closed (the queue)
// view=mine  → inquiries where THIS attorney has engaged (sent any message or offer)
export async function GET(req: Request) {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  const url = new URL(req.url)
  const view = url.searchParams.get('view') || 'open'

  if (view === 'mine') {
    // Find inquiry_ids this attorney has touched (messaged or offered).
    const [{ data: msgRows }, { data: offerRows }] = await Promise.all([
      ctx.db
        .from('inquiry_messages')
        .select('inquiry_id')
        .eq('sender_profile_id', ctx.profileId)
        .eq('sender_role', 'attorney'),
      ctx.db.from('attorney_offers').select('inquiry_id').eq('attorney_id', ctx.attorneyId),
    ])

    const ids = Array.from(
      new Set([
        ...(msgRows ?? []).map((r) => r.inquiry_id),
        ...(offerRows ?? []).map((r) => r.inquiry_id),
      ]),
    )
    if (ids.length === 0) return Response.json({ inquiries: [] })

    const { data, error: qErr } = await ctx.db
      .from('inquiries')
      .select('id, email, full_name, phone, country, case_type, case_type_label, urgency, recommended_tier, answers, status, created_at')
      .in('id', ids)
      .order('created_at', { ascending: false })

    if (qErr) return Response.json({ error: qErr.message }, { status: 500 })
    return Response.json({ inquiries: data ?? [] })
  }

  // Default: open queue (anything not finalised). Attorneys see all such
  // inquiries even after another attorney has engaged — competing offers are
  // expected. Surfaces targeted_to_me first so a directly addressed inquiry
  // jumps to the top of this attorney's queue.
  const { data, error: qErr } = await ctx.db
    .from('inquiries')
    .select('id, email, full_name, phone, country, case_type, case_type_label, urgency, recommended_tier, answers, status, target_attorney_profile_id, created_at')
    .in('status', ['open', 'engaged', 'claimed'])
    .order('created_at', { ascending: false })
    .limit(200)

  if (qErr) return Response.json({ error: qErr.message }, { status: 500 })

  const decorated = (data ?? []).map((q) => ({
    ...q,
    targeted_to_me: q.target_attorney_profile_id === ctx.profileId,
  }))
  // Targeted-to-me first.
  decorated.sort((a, b) => Number(b.targeted_to_me) - Number(a.targeted_to_me))

  return Response.json({ inquiries: decorated })
}
