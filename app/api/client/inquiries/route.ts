import { requireClient } from '@/lib/clientAuth'

export const runtime = 'edge'

// Returns inquiries the signed-in client either owns by profile_id, or that
// match their email (covers anonymous submissions made before the user signed
// up, which we backfill on the fly).
export async function GET() {
  const { ctx, error, status } = await requireClient()
  if (!ctx) return Response.json({ error }, { status })

  // Backfill any inquiries submitted with this email that don't yet have a profile_id.
  const backfill = await ctx.db
    .from('inquiries')
    .update({ client_profile_id: ctx.profileId })
    .eq('email', ctx.email)
    .is('client_profile_id', null)

  if (backfill.error) {
    if (isMissingTable(backfill.error.message)) {
      return Response.json({ inquiries: [], schema_pending: true })
    }
    console.error('[client/inquiries] backfill error', backfill.error.message)
  }

  const { data, error: qErr } = await ctx.db
    .from('inquiries')
    .select('id, case_type_label, country, urgency, status, claimed_by_attorney_id, claimed_at, created_at')
    .eq('client_profile_id', ctx.profileId)
    .order('created_at', { ascending: false })

  if (qErr) {
    if (isMissingTable(qErr.message)) {
      return Response.json({ inquiries: [], schema_pending: true })
    }
    console.error('[client/inquiries] select error', qErr.message)
    return Response.json({ error: qErr.message }, { status: 500 })
  }

  return Response.json({ inquiries: data ?? [] })
}

function isMissingTable(message: string | undefined | null): boolean {
  if (!message) return false
  return /relation .*does not exist|could not find the table|schema cache/i.test(message)
}
