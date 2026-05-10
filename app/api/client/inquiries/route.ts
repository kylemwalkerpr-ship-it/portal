import { requireClient } from '@/lib/clientAuth'

export const runtime = 'edge'

// Returns inquiries the signed-in client either owns by profile_id, or that
// match their email (covers anonymous submissions made before the user signed
// up, which we backfill on the fly).
export async function GET() {
  const { ctx, error, status } = await requireClient()
  if (!ctx) return Response.json({ error }, { status })

  // Backfill any inquiries submitted with this email that don't yet have a profile_id.
  await ctx.db
    .from('inquiries')
    .update({ client_profile_id: ctx.profileId })
    .eq('email', ctx.email)
    .is('client_profile_id', null)

  const { data, error: qErr } = await ctx.db
    .from('inquiries')
    .select('id, case_type_label, country, urgency, status, claimed_by_attorney_id, claimed_at, created_at')
    .eq('client_profile_id', ctx.profileId)
    .order('created_at', { ascending: false })

  if (qErr) return Response.json({ error: qErr.message }, { status: 500 })

  return Response.json({ inquiries: data ?? [] })
}
